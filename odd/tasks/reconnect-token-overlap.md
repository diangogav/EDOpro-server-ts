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
- Keep the previous token resolvable for a short overlap after rotation (about 60s), or until the
  new token is proven delivered, whichever comes first.
- Revoke (room teardown) must drop both the current and any overlapping previous token.
- Shared issuer: applies to both the YGOPro/WS and EDOPro/TCP subtrees.

## Out of scope
Closing the old socket on takeover, heartbeat tuning, token persistence across restarts.

## Tasks
- [x] T1 Previous token stays valid during the overlap window; revoke clears both; tests.
  Route: delegated direct (writer, server repo).

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
