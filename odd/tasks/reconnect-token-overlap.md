> Superseded by odd/tasks/reconnect-hardening.md (A1: one fixed token per match).

# Reconnect token overlap

## Objective
A player whose socket drops again while a reconnect is in flight can still reconnect.

## Problem
`ReconnectionTokenIssuer.rotate` (src/shared/.../ReconnectionTokenIssuer.ts) unregisters the old token
before the client has received the new one. The ack and board resync go out first; the new token is
the last frame. On mobile (Android PWA backgrounded and resumed repeatedly) the socket often dies in
that window, the client retries with the old token, the server answers a failure ack, and the client
declares the connection lost for good. Observed 2026-10-19 in a production matchmaking match.

## Scope
- Keep the previous token resolvable for a fixed overlap window after rotation (60s).
- When the client reconnects again with that overlapping token (the newer one never reached it), keep
  the presented token as the previous one and restart its window.
- Revoke (room teardown) must drop both the current and any overlapping previous token.
- Shared issuer: applies to both the YGOPro/WS and EDOPro/TCP subtrees.

## Out of scope
Closing the old socket on takeover, heartbeat tuning, token persistence across restarts.

## Tasks
- [x] T1 Previous token stays valid during the overlap window; revoke clears both; tests.
  Route: delegated direct (writer, server repo).
- [x] T2 Repeat drop: `rotate(client, roomId, presentedToken?)` keeps the token the client presented as
  previous (window restarted) and unregisters the undelivered current token; all YGOPro and EDOPro
  reconnect paths pass the presented token. Route: delegated direct (writer, server repo).

## Acceptance
- Reconnecting with the pre-rotation token within the window re-attaches to the same client.
- After the window, or after revoke, the old token is rejected.
- No token outlives its room.

## Checks
TDD: enabled (session config, Strict TDD Mode). Runner: `npm test` (jest). Plus typecheck/lint per repo scripts.

## Progress
- Branch `fix/reconnect-token-overlap` from origin/main.
- T1 done (route: delegated direct). RED: issuer suite failed to compile (no `PREVIOUS_TOKEN_OVERLAP_MS`), then
  4 existing state tests failed once rotate kept the old token. GREEN: `npm test` 235 suites / 2283 tests pass;
  `npx tsc --noEmit` clean; `npm run lint` clean. Previous token is tracked per client in the issuer (WeakMap,
  one entry, unref'd 60s timer); `revoke` and re-rotation drop it. Callers unchanged. Existing state tests
  that asserted the old token vanished now assert it stays resolvable.
- T2 done (route: delegated direct). Bug: client holds A, server rotated A->B but B never arrived;
  reconnect with A demoted B and dropped A, so a second drop left the client with an unknown token.
  RED: 3 new issuer tests failed with the parameter accepted but ignored. GREEN: see verification below.
  EDOPro dueling rotates from the core RECONNECT callback, so the presented token is carried per client
  from EXPRESS_RECONNECT.
