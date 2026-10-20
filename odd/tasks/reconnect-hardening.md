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
- Ticketless sockets (TCP, custom rooms, WindBot, EDOPro, MDPro4) keep working as today.

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
- [ ] A5 Ticket validation infrastructure error (Redis down) degrades the socket to anonymous
      instead of rejecting; an invalid/consumed ticket is still rejected.
- [ ] A6 Structured reconnect telemetry log: path (token / by-name), outcome, client transport,
      verified or not, redacted token prefix.
PR B — liveness and settlement
- [ ] B1 Verify mid-duel no-show settlement (ranked result recorded when the clock runs out with
      the player absent); fix if missing.
- [ ] B2 Half-open detection: TCP keepalive interval/probes or app-level idle detection so a dead
      TCP peer is noticed in well under a minute; WS heartbeat reviewed.
- [ ] B3 Between-duel abandon grace measured from the last inbound frame, not from detection.

## Progress
- A1 done: `ReconnectionTokenIssuer.resend` replaces rotate; overlap/previousTokens/presentedToken removed. RED: 6 tests failed (issuer, DuelingState, SideDeckingState, YGOProReconnectByToken); GREEN: 450 passed in shared/room + edopro/ygopro states; tsc clean.
- A2 done: `redactSecret` (6-char prefix + ellipsis) at 9 state/handler log sites + RedisTicketRepository. RED: ExpressReconnectHandler log test failed; GREEN after change (22 reconnect/ticket tests pass).
- A2 addendum: debug "Incoming message" hex dumps (WS + TCP handlers) hid the raw 0xfd/0xfb frames; `frameForLog` hides RECONNECT and MATCHMAKING_AUTH payloads.
- A3 done: ExpressReconnectHandler.identityMatches; auth gate verified (every inbound frame awaits `ready`, resolved only after resolvedUserId is set in WSYGOProServer); gate test added. RED: mismatch test failed, GREEN 20 reconnect tests.
- A4 done: `ISocket.closeSuperseded()` (WS close 4001 "session superseded", terminate fallback 2000 ms; TCP end + destroy fallback); YGOProRoom.reconnect closes the previous socket after attaching the new one. EDOpro `Client.setSocket` already destroys a different previous socket (listeners removed first), unchanged. RED: compile/test failures in socket + room suites; GREEN 433 tests.

## Superseded
odd/tasks/reconnect-token-overlap.md (60s overlap + presented token) is replaced by A1.

## Checks
TDD: enabled (session Strict TDD Mode). Runner: jest (`npm test`), plus `npx tsc --noEmit`, `npm run lint`.

## Delivery
Two PRs: A on fix/reconnect-token-overlap (renamed scope), B stacked or after A merges.
