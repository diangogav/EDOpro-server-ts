# Room Re-entry — Reconnection, Spectating, and Watching

How a socket enters a room that already exists: as a **reconnecting player**
resuming a seat, as a **spectator** watching from the stands, or via the
explicit **watch** command. This is the companion to `join-commands.md`, which
covers how the initial join command is parsed and routed; this document focuses
on what happens when the target room is already populated or already in a duel,
and on the identity/authorization rules that gate each path.

Evidence references point at the current source; update them if files move.

## 1. The three ways back into a room

| Path | Trigger | Outcome | Section |
|------|---------|---------|---------|
| Token (express) reconnect | Connection-level `0xfd` frame carrying a reconnection token | Resume your seat, any state | §3 |
| By-name / identity reconnect | A normal `CTOS_JOIN_GAME` routed to a room whose duel is in progress | Resume your seat **only if** the account matches | §4 |
| Spectator | A join that cannot (or is not meant to) take a seat | Watch from the stands | §5 |
| Watch command | `w,<roomId>[#password]` | Spectate a chosen room by id | §6 |

A single join frame flows through the pipeline in `join-commands.md`; which of
the above it lands on depends on the room's state, the joiner's credential, and
the command shape.

## 2. Identity: how the server knows who is joining

Every joining socket resolves to exactly one `PlayerCredential`
(`src/shared/client/application/CredentialResolver.ts`), in one pass, strongest
first (`src/shared/room/admission/domain/PlayerCredential.ts`):

- **`verified`** — authenticated by the handshake ticket
  (`socket.resolvedUserId`, the evolution client). Carries an account `userId`.
- **`external`** — authenticated by the legacy 4-character PIN carried in the
  nickname. Carries the **same** account `userId` as `verified`; only the proof
  strength differs.
- **`guest`** — no valid credential. Carries only a display name.

An invalid/banned ticket or a wrong PIN does **not** reject at resolution — it
degrades to `guest`. Whether a `guest` is allowed in is the admission policy's
decision, not the resolver's.

`isStrongAuth` is true **only** for `verified` (`YgoClient.ts:155`). This is the
line that keeps ticket players unreachable by the weak reconnect path (§4).

## 3. Token (express) reconnection

The strong path, used by the evolution client. When a player is seated, the
server issues a **reconnection token**
(`src/shared/room/application/reconnect/ReconnectionTokenIssuer.ts`):

- 128-bit (`crypto.randomBytes(16)`), single-use (rotated on every reconnect),
  bound to one room id, revoked when the room tears down.
- The client reconnects by sending a connection-level `0xfd` frame with the
  token; the handler resolves the room from the token entry itself
  (`ExpressReconnectHandler.ts`), never from client-supplied room data.

Because the token is proof of a prior admitted seat, this path **bypasses the
join-command gates entirely** — including the watch stamp and the identity
check below. Possessing the token *is* the authorization. It is also **not**
subject to the join rate limit (§7): a flapping mobile client resuming its own
duel is never throttled.

## 4. By-name / identity reconnection (the weak path)

When a normal `CTOS_JOIN_GAME` is routed to a room whose duel is already in
progress (RPS, choosing order, dueling, side decking), the state's join handler
asks whether this joiner is a seated player coming back
(`findReconnectingPlayer.ts`, via `findMidDuelReconnectingPlayer.ts`). This is
the path external/legacy clients use; the evolution client uses §3 instead.

A reconnection is granted **only** when every guard holds:

1. The target seat is **not** `verified` (strong-auth players return by token
   only — a ticket seat is never reachable here, even with a stolen PIN or a
   different ticket).
2. The display name matches.
3. Then, by room type:
   - **Casual rooms** — additionally bound to the original location and only
     take over a socket already known closed: `socket.remoteAddress` must match
     and `socket.closed` must be true. Casual rooms have no PIN, so the remote
     address is the only credential available.
   - **Ranked rooms (external/PIN)** — bound to the **account identity**: the
     joiner's resolved credential must carry the **same `userId`** as the seat.
     The display name is chosen by the client and is public, so a name match
     alone never grants a seat. An identity-less (`guest`) joiner, or a
     different account, is denied and falls through to spectating (§5).

### Why ranked does not check liveness

Ranked rooms intentionally do **not** require the old socket to be closed.
Mobile clients on the raw-TCP path leave a **half-open** socket when
backgrounded — no FIN/RST reaches the server, so `socket.closed` stays false
indefinitely (that path has no liveness heartbeat). Requiring it there locked
legitimate players out of their own duel. The account-identity binding makes
liveness unnecessary: a returning PIN player re-sends the same PIN, resolves to
the same `userId`, and reclaims the seat regardless of whether the stale socket
still looks alive. The stale socket is detached from the seat when the new one
is attached (`YGOProRoom.reconnect` → `YGOProClient.setSocket`); it is not
actively destroyed (a known residual left to the socket's own lifecycle).

### Robustness

The joiner's identity is resolved under the room mutex, and the resolution is
**bounded (5s) and fails closed to spectator** on error or timeout
(`resolveJoinerIdentityWithTimeout.ts`): a slow or hung account lookup can
neither seat the wrong player nor hold the room lock indefinitely.

### The edopro flavor

The desktop/edopro states share `findReconnectingPlayer` but never record a
credential on the seat, so they take the legacy name-rule branch — and gate
ranked reconnection separately with their own PIN authentication
(`CheckIfUseCanJoin` inside `Reconnect.run`).

## 5. Spectating

Spectating is, in most paths, a **fallback outcome** rather than an explicit
request: you become a spectator when you reach a room you may enter but cannot
(or are not meant to) take a seat in.

- **Waiting room, no free seat or league mismatch** — `RoomAdmission` seats you
  if it can, otherwise puts you in the stands
  (`src/shared/room/admission/domain/RoomAdmission.ts`). A waiting-room
  spectator can still self-promote to a seat via `TO_DUEL` if one frees up.
- **Mid-duel room reached by a normal join** — if you are not a reconnecting
  player (§4), you enter as a spectator and receive the duel's historical
  messages re-encoded through the spectator-filtered view (`observerView()`),
  so hidden information (hands, face-down cards) is not leaked.
- **Watch command** — the one **explicit** spectate request (§6).

### What spectating is gated by

- **Private (password) rooms** are gated by the exact room password on every
  entry path — a spectator needs it just like a player.
- **Reserved matchmaking rooms** keep their **seats** closed to everyone but
  the two matched players — no third party can take a seat or reconnect into one,
  in any state (see `join-commands.md`, reservation gate; this runs first in
  every room state). They are, however, **watchable**: a watch join (§6) enters
  as a spectator. Spectators only ever receive the opponent view (no hands), so a
  ranked duel can be observed by id without exposing hidden information or a seat.

## 6. Watch command — `w,<roomId>[#password]`

The explicit spectate primitive. Resolve a room by its **id** (shown in the
lobby room list) and enter as a spectator in any state
(`WatchJoinStrategy.ts`).

- Shape: exactly two comma tokens — `w` (case-insensitive) and an all-digits
  room id — optionally followed by `#<password>`.
- Resolves the room via `YGOProRoomList.findById`. **A watch join never creates
  a room**: an unknown id is rejected (JOINERROR), never turned into a new empty
  room. This is the deliberate contrast with the `name#password` path, which
  silently creates a fresh room on a miss.
- The password must match the room's exactly (empty matches empty). A mismatch
  is rejected, not silently turned into a new room.
- A watch joiner is stamped (server-side, from the parsed command, scoped to the
  resolved room id) so they **never take a seat**: the waiting state offers them
  no chair, and the mid-duel states force the spectator branch — a watch join is
  never mistaken for a reconnection (§4), even if the joiner's name or account
  would otherwise match a seat.
- Reserved matchmaking rooms **admit watchers as spectators** (§5): the watch
  stamp only ever grants a spectator, never a seat, so opening a reserved room to
  watchers does not weaken its seat reservations. A non-watch third party is
  still rejected, and a watch spectator cannot promote into a reserved seat via
  `TO_DUEL` (that door requires a reserved identity).

Watch is placed before the ticket strategy in the chain so that a
ticket-authenticated socket sending `w,<id>` spectates instead of creating a
room.

## 7. Join rate limiting

The ygopro socket join path is rate-limited **per IP**
(`YGOProJoinHandler.handleJoinGame`), before command parsing, strategy
resolution, and any database or room-id work: default **60 joins per 60
seconds** per IP, configurable, and **fails open** when Redis is unavailable
(a limiter outage never blocks joins). This bounds room-id exhaustion, room
enumeration via `w,<id>` sweeps, and PIN brute-force at the mid-duel door.

Token (express) reconnection (§3) is a different frame and is **not** counted,
so a mobile client resuming its own duel over a bad network is never throttled.

## 8. Quick reference — "why did I end up here?"

| You did | Room state | You are `verified` (ticket) | You are `external` (PIN) | You are `guest` |
|---------|-----------|------------------------------|--------------------------|-----------------|
| Rejoined your own duel (evolution client) | mid-duel | Seat, via token (§3) | Seat, via token if issued | — |
| Rejoined by name, same account | mid-duel ranked | Token only (name path denied) | **Seat** (identity match) | n/a (no account) |
| Rejoined by name, different/no account | mid-duel ranked | Denied → stands | Denied → stands | Denied → stands |
| Rejoined by name, casual | mid-duel casual | Token only | Seat if same address + old socket closed | Seat if same address + old socket closed |
| Joined a full waiting room | waiting | Stands (may promote on `TO_DUEL`) | Stands | Stands |
| Sent `w,<id>` | any | Stands | Stands | Stands |
| Sent `w,<id>` to a reserved matchmaking room | any | Stands (spectator, no seat) | Stands (spectator, no seat) | Stands (spectator, no seat) |
| Tried to take a seat in a reserved room (join or `TO_DUEL`) without being matched | any | Rejected | Rejected | Rejected |
