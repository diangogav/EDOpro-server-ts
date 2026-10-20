# Matchmaking bot fallback opt-in

## Objective
A player only gets a bot opponent from the ranked queue when their ticket asked for it.

## Problem
`BotFallbackPolicy` pairs every ticket that has waited past `BOT_FALLBACK_MS` (60s) with an unrated
bot match, unconditionally. MDPro3 players complain: they queued to face humans; if they wanted a bot
they would play solo mode.

## Scope
- Per-ticket `botFallbackAfterMs` accepted at enqueue, on both the HTTP poll path and the socket
  protocol path. Absent means the ticket never gets a bot; present, it is clamped to [30s, 5min].
- `BotFallbackPolicy` skips participants without a delay; they keep waiting for a human.
- Shared contract doc (`evolution-card-game/docs/architecture/matchmaking-contract.md`) documents the
  field.

## Out of scope
Playing a bot while queued (phase 2, web client), a server-side maximum wait.

## Constraints
- Absent delay means no bot, so MDPro3 stops receiving bots with no client change.
- Consequence: the web client also stops receiving bots until it sends `botFallbackAfterMs`.

## TDD
Strict TDD enabled (session config). Runner: `npx jest` (package.json `test`).

## Tasks
- [x] T1 Server: flag on enqueue (HTTP + socket), carried to `Participant`, honored by
  `BotFallbackPolicy`; tests. Route: delegated direct (writer; 2+ non-trivial files).
- [x] T2 Contract doc in evolution-card-game documents `allowBotFallback`. Route: direct inline.

- [x] T3 Server: replace boolean `allowBotFallback` with `botFallbackAfterMs` (client-chosen delay,
  clamped to [30s, 5min]; absent means no bot). Socket: optional uint32 LE ms after the 4-byte ENTER
  body. Also tighten the opt-out protocol assertion and harness flag parsing flagged by review.
  Route: delegated direct (writer; 2+ non-trivial files).
- [x] T4 Contract doc documents `botFallbackAfterMs`. Route: direct inline.
- [x] T5 Server follow-ups: precedence tests opt one ticket in; log each ticket's queue exit with
  outcome and waited time (observability of long waits); harness reuses the domain clamp constants and
  rejects values above uint32. Route: delegated direct (writer).
- [x] T6 Web client (evolution-card-game) sends `botFallbackAfterMs: 60000` on every enqueue path,
  keeping today's 60s bot fallback for web players. Route: delegated direct (writer, other repo).

Accepted change (2026-10-20): the user chose a client-chosen delay over a fixed 60s. A server-side
max wait was rejected: clients already end the wait by cancelling.

## Acceptance criteria
- Ticket without the flag never gets a bot, however long it waits.
- Ticket with `botFallbackAfterMs` gets a bot after that delay (clamped to [30s, 5min]) when one is
  available.
- Human pairing unaffected.

## Checks
`npx jest`, `npx tsc --noEmit`, lint.

## Progress
- 2026-10-20: branch `feat/matchmaking-bot-fallback-opt-in` created from main (3d779166).
- T1 done in 0f14e099. HTTP: `allowBotFallback` optional boolean in `EnqueueMatchmakingSchema` (400 on
  non-boolean). Socket: optional fifth ENTER byte (0/1) in `parseCtosEnter`, absent means false.
  TDD: RED observed (8 suites), then GREEN. Checks: `npx jest` 242 suites / 2352 tests passed,
  `npx tsc --noEmit` clean, `pnpm lint` clean; parent spot check `npx jest src/ygopro/matchmaking`
  24 suites / 231 tests passed.
- T2 done in evolution-card-game 5803e93a (branch `docs/matchmaking-bot-fallback-opt-in`).
- Review: assessed high (process_boundary on `src/utils/matchmaking-harness.ts`); consent granted;
  4-lens native review approved and acknowledged (lineage review-17cecaf7f29dcffd, authority burned).
  Non-blocking follow-ups: unbounded human wait with no metric/log when fallback is skipped;
  weak opt-out assertion in `matchmaking-protocol.test.ts:61-67`; harness flag parsing suggestions.

- T3 done in fec8006a. HTTP `botFallbackAfterMs` (non-negative integer, else 400); socket ENTER is
  4 bytes (no bot) or 8 bytes with a uint32 LE delay; `clampBotFallbackDelay` with
  `BOT_FALLBACK_MIN_MS`/`BOT_FALLBACK_MAX_MS` in `QueueEntry.ts`; harness flag fails loudly; protocol
  tests assert whole results. Checks: `npx jest` 242 suites / 2377 tests passed, `npx tsc --noEmit`
  clean, `pnpm lint` clean; parent spot check `npx jest src/ygopro/matchmaking` 243 passed.
- T4 done in evolution-card-game 31583158.

- T5 done in 53c0b0b6. `MatchmakingPool` logs `matchmaking.exit` { participantId, outcome, waitedMs,
  format, presence, hasBotFallback } at every removal; precedence tests opt in and were proven RED by
  swapping policy order; harness rejects values above uint32. Checks: `npx jest` 2388 passed,
  `npx tsc --noEmit` and `pnpm lint` clean; parent spot check domain 66 passed. Known gap: if a match
  handler throws and re-adds participants, a second exit line follows the `matched_*` one.
- T6 done in evolution-card-game 9b151045: the web client has no HTTP enqueue; the socket ENTER
  (`LobbyManager.connectForMatchmaking`, also used for requeue) sends 60000 ms. Review (1 lens)
  approved and acknowledged (lineage review-c82bd35e7ccc4896).
- Deploy order: the server must ship before the web client; `main` rejects any ENTER body that is
  not exactly 4 bytes.

## Next step
All tasks done. Review of 53c0b0b6 approved and acknowledged (lineage review-6fa5f3331e8531e1).
Open the server and web client PRs; deploy the server first. Rollback: reverting the server alone
breaks web matchmaking (the old parser rejects 8-byte ENTER bodies), so revert the web client first.
Non-blocking follow-ups: the exit log fires before the match handler runs and omits the delay value.
