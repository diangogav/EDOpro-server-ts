# Reconnect hardening

## Objective
Token reconnection that cannot lose its key mid-flight, cannot be hijacked by another account,
does not leak secrets, survives Redis hiccups, ends seat ping-pong between two live instances,
and detects half-open connections fast enough that between-duel grace is honest.

## Why
2026-10-19 incident: Android PWA player backgrounded/resumed several times mid-duel, saw
"reconnecting" with good internet, reconnection eventually stopped; duel 2 rendered without
playmat/backs. End-to-end review (client, API, server) found the rotation race, token-only
authentication, tokens logged in plaintext (11 sites), Redis failure rejecting a valid reconnect,
old socket never closed on takeover, and TCP half-open detection relying on OS keepalive defaults.

## Compatibility constraints (MDPro4 is closed source and assumed to use 0xfd)
- 0xfd CTOS/STOC byte layouts, 32-hex token, ack 0x00/0x01, length-based discrimination: unchanged.
- Token STOC still sent after every successful reconnect (same value). Web client relies on it to
  refresh its stored session and clear the reconnecting state.
- By-name reconnect for non-verified seats: unchanged.
- Ticketless sockets keep working for non-verified seats; verified seats need the owner's identity (A7).

## Contract shared with the web client
- WebSocket close code 4001, reason "session superseded": sent to the OLD socket when a reconnect
  takes over its seat. Clients must not auto-reconnect on it.

## Tasks
PR A — token and identity
- [x] A1 Fixed token per match: issue once, re-send the same value after each reconnect; remove
      rotation/overlap/presented-token machinery from the previous branch commits. Route: delegated.
- [x] A2 No secrets in logs: tokens and tickets redacted (short prefix or hash) at every log site.
- [x] A3 Identity binding: when the seat is verified and the reconnecting socket carries a
      resolvedUserId, they must match; ticketless sockets accepted as today.
- [x] A4 Takeover closes the old socket (WS close 4001 "session superseded"; TCP end/destroy).
- [x] A5 Ticket validation infrastructure error (Redis down) degrades the socket to anonymous
      instead of rejecting; an invalid/consumed ticket is still rejected.
- [x] A6 Structured reconnect telemetry log: path (token / by-name), outcome, client transport,
      verified or not, redacted token prefix.
- [x] A7 Require identity for verified seats: a verified seat's token reconnect needs a socket
      whose resolvedUserId equals the seat owner (outcomes identity_missing / identity_mismatch);
      non-verified seats stay token-only. Route: inline.
PR B — liveness and settlement
- [x] B1 Verify mid-duel no-show settlement (ranked result recorded when the clock runs out with
      the player absent); fix if missing.
- [x] B2 Half-open detection: TCP keepalive interval/probes or app-level idle detection so a dead
      TCP peer is noticed in well under a minute; WS heartbeat reviewed.
- [x] B3 Between-duel abandon grace measured from the last inbound frame, not from detection.

## Progress
- A1 done: `ReconnectionTokenIssuer.resend` replaces rotate; overlap/previousTokens/presentedToken removed. RED: 6 tests failed (issuer, DuelingState, SideDeckingState, YGOProReconnectByToken); GREEN: 450 passed in shared/room + edopro/ygopro states; tsc clean.
- A2 done: `redactSecret` (6-char prefix + ellipsis) at 9 state/handler log sites + RedisTicketRepository. RED: ExpressReconnectHandler log test failed; GREEN after change (22 reconnect/ticket tests pass).
- A2 addendum: debug "Incoming message" hex dumps (WS + TCP handlers) hid the raw 0xfd/0xfb frames; `frameForLog` hides RECONNECT and MATCHMAKING_AUTH payloads.
- A3 done: ExpressReconnectHandler.identityMatches; auth gate verified (every inbound frame awaits `ready`, resolved only after resolvedUserId is set in WSYGOProServer); gate test added. RED: mismatch test failed, GREEN 20 reconnect tests.
- A4 done: `ISocket.closeSuperseded()` (WS close 4001 "session superseded", terminate fallback 2000 ms; TCP end + destroy fallback); YGOProRoom.reconnect closes the previous socket after attaching the new one. EDOpro `Client.setSocket` already destroys a different previous socket (listeners removed first), unchanged. RED: compile/test failures in socket + room suites; GREEN 433 tests.
- A5 done: `TicketConsumeResult` (consumed/invalid/unavailable) + `HandshakeTicketStore.consumeWithStatus`; Redis error, missing instance or >2000 ms => unavailable; HandshakeTicketAuthenticator returns `unavailable`, WSYGOProServer warns and proceeds anonymous. `TicketRepository.consume` (matchmaking, enqueue) stays fail-closed. RED: Redis/authenticator/server suites failed; GREEN 297 tests across ticket, socket-server, http-server, matchmaking.
- A6 done: `logReconnectAttempt` emits "reconnect.attempt" {path, outcome, transport, verified, identityChecked, tokenPrefix}; token path in ExpressReconnectHandler (outcomes forwarded/unknown_token/room_not_found/identity_mismatch), by-name at the 4 YGOPro + 4 EDOpro mid-duel join doors (outcome matched); `ISocket.transport` added. RED: handler telemetry tests failed; GREEN. Full: npm test 238 suites / 2314 tests pass, tsc and lint clean.
- A-review follow-ups: `frameForLog` walks every frame in a chunk (partial tail prints `<partial len=N>`); reject log names its outcome; identity predicate simplified; DuelingState/RedisTicketRepository comments fixed; by-name `identityChecked` documented. RED: 3 frameForLog tests failed; GREEN: reconnect/logger suites pass.
- A7 done: `ExpressReconnectHandler.identityOutcome` (verified seat + no/other resolvedUserId => failure ack + destroy, `identity_missing` added to `ReconnectOutcome`). Ticketless-reconnect test inverted; telemetry test added. TCP: `MatchmakingReconnectIdentity.test.ts` proves 0xfb, awaited, then 0xfd succeeds; pipelined 0xfb+0xfd loses the race (AUTH runs async via `void authenticate.execute`), documented in docs/room-reentry.md. RED: 2 handler tests failed; GREEN: 30 tests. Constraint change: ticketless sockets no longer reconnect verified seats.
- B1 done (verified, no fix needed): neither engine pauses the clock on disconnect. YGOPro: `OCGCore` response timer -> `FINISH_DUEL_BY_TIMEOUT` -> `handleWinCondition` -> `MatchLifecycleHooks.runEnding` (ranked result + ratings) when the match is decided, else side decking, where `SIDE_TIMEOUT_MINUTES` (default 3) resolves the abandon via `EndMatchByAbandon`. EDOpro: `Room` timers -> `FinishDuelHandler` TIMEOUT -> `runEnding` + `RoomList.deleteRoom`. Tests `YGOProMidDuelNoShow.test.ts` and `RoomMidDuelNoShow.test.ts` pass on first run (behavior already correct, so no RED). Known residual: a mid-duel drop that ends a non-final duel gets no 60 s abandon grace (the player was already gone when side decking began), the 3 min side-deck timeout settles it instead; rooms with `time_limit` 0 have no clock, so a lone absentee is only reaped when both players are gone.
- B2 done: Node 24.17 (libuv 1.52) `setKeepAlive` exposes only the idle delay, no interval/count, so the code cannot tune probes. `docker-compose.prod.yaml` sets `net.ipv4.tcp_keepalive_intvl=5` / `tcp_keepalive_probes=3` (1 s + 3 x 5 s = ~16 s vs ~11 min), `tcpKeepAlive.ts` warns at boot when the effective detection time exceeds 60 s, `docs/architecture.md` documents it. No app-level idle timeout (EDOPro/MDPro idle clients are untouched). WS heartbeat default 30 s -> 15 s (worst-case detection 60 s -> 30 s), still `YGOPRO_WEBSOCKET_HEARTBEAT_MS`. RED: tcpKeepAlive suite failed to resolve the module; GREEN: socket + socket-server suites 64 tests.
- B3 done: `ISocket.lastInboundAt` (TCP: any `data`; WS: any `message` or heartbeat `pong`, tracked by listeners independent of the pump), `AbandonBetweenDuels.remainingGraceMs` clamps `ABANDON_GRACE_MS - silence` to [0, 60 s]; the notice to the opponent carries the remaining seconds. RED: 2 abandon tests failed + compile errors on the sockets; GREEN: socket + abandon suites 54 tests.
- B3 review correction: TCP leavers always get the full 60 s abandon window; silence only shortens it on WebSocket, where heartbeat pongs keep `lastInboundAt` fresh. RED: new TCP test failed; GREEN: full jest suite passes.

## Superseded
odd/tasks/reconnect-token-overlap.md (60s overlap + presented token) is replaced by A1.

## Checks
TDD: enabled (session Strict TDD Mode). Runner: jest (`npm test`), plus `npx tsc --noEmit`, `npm run lint`.

## Delivery
Two PRs: A on fix/reconnect-token-overlap (renamed scope), B stacked or after A merges.
