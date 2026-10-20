# Matchmaking bot fallback opt-in

## Objective
A player only gets a bot opponent from the ranked queue when their ticket asked for it.

## Problem
`BotFallbackPolicy` pairs every ticket that has waited past `BOT_FALLBACK_MS` (60s) with an unrated
bot match, unconditionally. MDPro3 players complain: they queued to face humans; if they wanted a bot
they would play solo mode.

## Scope
- Per-ticket `allowBotFallback` flag accepted at enqueue, on both the HTTP poll path and the socket
  protocol path. Absent means `false`.
- `BotFallbackPolicy` skips participants that did not opt in; they keep waiting for a human.
- Shared contract doc (`evolution-card-game/docs/architecture/matchmaking-contract.md`) documents the
  flag.

## Out of scope
Playing a bot while queued (phase 2, web client), web client sending the flag (follow-up), changing
`BOT_FALLBACK_MS`.

## Constraints
- Default `false` so MDPro3 stops receiving bots with no client change.
- Consequence: the web client also stops receiving bots until it sends `allowBotFallback: true`.

## TDD
Strict TDD enabled (session config). Runner: `npx jest` (package.json `test`).

## Tasks
- [x] T1 Server: flag on enqueue (HTTP + socket), carried to `Participant`, honored by
  `BotFallbackPolicy`; tests. Route: delegated direct (writer; 2+ non-trivial files).
- [x] T2 Contract doc in evolution-card-game documents `allowBotFallback`. Route: direct inline.

## Acceptance criteria
- Ticket without the flag never gets a bot, however long it waits.
- Ticket with `allowBotFallback: true` gets a bot after `BOT_FALLBACK_MS` when one is available.
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

## Next step
Push/PR (user decision); then the web client sends `allowBotFallback: true` (follow-up).

