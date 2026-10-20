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
Playing a bot while queued (phase 2, web client), web client sending `botFallbackAfterMs`
(follow-up), a server-side maximum wait, wait-time observability (follow-up).

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

## Next step
Push/PR (user decision); then the web client sends `botFallbackAfterMs` (follow-up).
Review of fec8006a approved and acknowledged (lineage review-77c2abf129d109ed). Non-blocking
follow-ups: human-over-bot precedence tests in `MatchmakingQueue.test.ts:491-492` and
`CompositePairingPolicy.test.ts` no longer opt any ticket in; long waits are not logged or counted;
harness duplicates the clamp literals and accepts values above uint32.

