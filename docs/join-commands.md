# YGOPro Join Commands — Structure and Handling

How the server interprets the `CTOS_JOIN_GAME` password ("join command"), how rooms
are matched and created from it, and where player/spectator decisions happen.
Evidence references point at the current source; update them if files move.

## 1. Command wire format

```
<config-tokens>[#<room-password>]
```

- The whole string rides the `CTOS_JOIN_GAME` `pass` field: **UTF-16LE, fixed
  `utf16[20]` — silently truncated past 20 characters**. Exactly-20 round-trips
  (no NUL terminator required by `ygopro-msg-encode`).
- `YGOProJoinHandler` splits on `#` and keeps only the first two segments
  (`src/ygopro/room/application/YGOProJoinHandler.ts:51`):
  - `command` = raw segment before the first `#` (case preserved).
  - `password` = segment after the first `#`, or `""`.
- Config tokens are comma-separated inside `command`. For rule resolution they
  are trimmed and lowercased; for room identity they are **not** (see §4).

Examples: `tcg`, `edison#myroom`, `nc,ns,ai#Blackwing`, `m,tt#duel1`.

## 2. Join pipeline

```
socket → MessageEmitter (Commands.JOIN_GAME = 18) → YGOProJoinHandler
       → JoinStrategyRegistry.resolve(ctx) → strategy.handle(ctx)
```

Strategy chain, first `matches()` wins
(`src/ygopro/room/application/join-strategies/composeJoinStrategies.ts`):

| # | Strategy | Matches when | Behavior |
|---|----------|--------------|----------|
| 1 | `AIJoinTokenStrategy` | windbot enabled AND `rawPass` starts with `AIJOIN#` | The bot itself connecting back: consumes a one-shot token, finds the room **by id**, marks the client internal. |
| 2 | `WindBotJoinStrategy` | windbot enabled AND `ai` among config tokens | Creates an AI room, resolves the bot (by name after `#`, or format-scoped random via `resolveBotPool`), fires the bot request. Rejects tag mode. |
| 3 | `TicketJoinStrategy` | socket authenticated via WS ticket (`resolvedUserId`) | Shared `findOrCreateRoom` helper (`rankedOverride=true`) — see §5 for the pairing-vs-non-pairing lookup it performs. |
| 4 | `DefaultJoinStrategy` | always | Shared `findOrCreateRoom` helper (`rankedOverride=undefined`) — see §5 for the pairing-vs-non-pairing lookup it performs. Admission is delegated to the room state (§6). |

On strategy error: `JOINERROR` frame + `socket.close()`.

`TicketJoinStrategy` and `DefaultJoinStrategy` share one function,
`findOrCreateRoom` (`src/ygopro/room/application/join-strategies/findOrCreateRoom.ts`),
parameterized by `{ rankedOverride }`. The two strategies differ ONLY in that
parameter — the find-or-create logic itself, including the pairing-join
branch described in §5, is identical for both.

## 3. Rule resolution (token catalog)

`YGOProRoom.create` (`src/ygopro/room/domain/YGOProRoom.ts:198-233`) lowercases
each token and applies three tiers from
`src/ygopro/room/domain/RuleMappings.ts`, in order — later tiers overwrite
earlier ones for the same option; **two matches inside one tier throw**:

1. **`ruleMappings`** (mode): `m`/`match`, `t`/`tag`.
2. **`formatRuleMappings`** (format presets): `edison`/`ed`, `hat`, `tengu`,
   `md`, `jtp`, `jtp-2007-03`, `jm`, `gx`, `mdc`, `goat`,
   `genesys`/`g`/`g<N>`/`genesys<N>`, `rush`, `rushpre`, `speed`, `world`,
   `pre`, `ocg`, `tcgpre`, `ocgpre`, `tcgart`, `ocgart`.
3. **`priorityRuleMappings`** (modifiers, win over format tokens): `bo<N>`,
   `lp<N>`, `tm<N>`/`time<N>`, `mr<N>`/`duelrule<N>`, `ot`/`tcg`, `otto`,
   `toot`/`tt`, `ns`, `nc`, `dr<N>`, `st<N>`, `to`/`tcgonly`/`tor`,
   `lf*`/`lflist*`, `nf`/`nolflist`, `oor`/`oo`/`ocgonly`, `or`, `tr`, `oomr`,
   `omr`, `tomr`, `tmr`.

Notes worth knowing:

- **`tcg` is an alias of `ot`** (priority tier): payload is `{ rule: 5 }` only —
  banlist and duel rule stay at the host defaults (first TCG banlist,
  duel_rule 5).
- `ocg` → `{ rule: 0, lflist: 0, time_limit: 450 }`;
  `md` → `{ rule: 5, lflist: alias("md"), duel_rule: 5, time_limit: 450 }`;
  `tcgpre` → `{ rule: 5, duel_rule: 5, time_limit: 450 }` (default TCG lflist);
  `ocgpre` → `{ rule: 5, duel_rule: 5, lflist: 0, time_limit: 450 }`;
  `tcgart`/`ocgart` are byte-identical to `tcgpre`/`ocgpre` in ruleset, but
  kept as separate tokens on purpose — token = room identity (§4/§5), so
  merging them would silently merge two distinct pairing pools.
- `g` resolves genesys (`rule: 1`, genesys banlist, `max_deck_points`
  default 100) and **throws if the genesys banlist is not loaded**.
- `pre`, `tcgpre`, `ocgpre`, `tcgart`, `ocgart`, `rushpre` additionally enable
  the **extended card pool** (`extendedCardPoolFormats`,
  `RuleMappings.ts:707`) — an effect separate from the tier payloads.
- Banlist aliases resolve by **normalized substring inclusion**
  (`MercuryBanListMemoryRepository.findIndexByAlias`), not exact match.
- Unrecognized tokens are silently ignored (host defaults apply:
  `rule: 1`, `mode: SINGLE`, `duel_rule: 5`, first TCG banlist).
- AI-pool resolution for random windbots mirrors the tier precedence
  (`src/ygopro/windbot/domain/resolveBotPool.ts`): priority TCG tokens win
  over format tokens regardless of position.

## 4. Room identity and matching

- `room.name` = the **raw, case-preserved** config segment of whichever string
  created the room. `room.password` = the raw segment after `#`.
- For **non-pairing** joins, room identity is the exact **(name, password)
  pair**: `YGOProRoomList.findByNameAndPassword`
  (`src/ygopro/room/infrastructure/YGOProRoomList.ts`) does plain `===` on
  both `room.name` and `room.password` against the joiner's `command` and
  `password`, and returns the **first** room matching both. A miss creates a
  new room under that exact pair — it never rejects the join. Two rooms
  sharing a name but differing in password are therefore always
  distinguishable and independently reachable.
- `YGOProRoomList.findByName` (name-only match) remains available for callers
  that need a name-only lookup (e.g. `MatchmakingRoomFactory`'s
  name-collision check when minting a fresh matchmaking room name); the join
  pipeline's non-pairing lookup uses `findByNameAndPassword` instead.
- Consequences:
  - **Case-sensitive identity**: `tcg` and `TCG` are two different rooms that
    resolve to the same ruleset.
  - **A bare token is both config AND room identity**: two strangers sending
    exactly `tcg` land in the same room and get seated as the two players.
    This started as an emergent side effect of `findByName`'s first-match
    lookup; §5 formalizes it into the designed pairing feature (still keyed
    on the exact command string, now state- and seat-aware).
  - `findByNameAndPassword` returns the **first** room matching the pair and
    **ignores room state** — a room stays in the list (and stays matchable)
    through `waiting → rps → choosingOrder → dueling → sideDecking` until
    `FinalizeYGOProRoom.run` removes it at match end. A joiner who supplies
    the correct password for a room mid-duel still resolves to that room
    (spectating decided downstream — see §6); a joiner who mistypes the
    password resolves to no existing room and gets a fresh, empty one of
    their own instead of a rejection.

## 5. Pairing joins

Any client can pair players by having them send the same bare token command
(e.g. `TCG`, `edison`) with no password — the server matches them into the
same room or gives each side a fresh one.

Added on top of the pipeline in §2 — `findOrCreateRoom`
(`src/ygopro/room/application/join-strategies/findOrCreateRoom.ts`) branches
into a **pairing lookup** instead of the non-pairing `findByNameAndPassword`
lookup when the join qualifies as a pairing join.

**Placement in the pipeline:** this branch lives entirely inside step 4 of §2
(`JoinStrategyRegistry.resolve(ctx) → strategy.handle(ctx)`), specifically
inside the shared `findOrCreateRoom` helper called by both `TicketJoinStrategy`
and `DefaultJoinStrategy`. It runs AFTER strategy resolution (so `AIJoinTokenStrategy`
and `WindBotJoinStrategy` are never affected) and BEFORE room admission (§6) —
it only decides WHICH room object the join is routed to, never who gets
seated once there.

**Predicate** (`isPairingJoin`,
`src/ygopro/room/application/join-strategies/isPairingJoin.ts`): a join is a
pairing join when ALL of the following hold:

- the password segment is empty (no `#` in the command, or nothing after it);
- the command is non-empty;
- every comma-separated token, trimmed and lowercased, is **recognized**:
  `isRecognizedToken(token)` (exported from `RuleMappings.ts` — true when the
  token matches at least one tier's `validate()`, per §3) **or** the literal
  token `"casual"`.

Concretely NOT pairing joins: `ai` (intercepted earlier by
`WindBotJoinStrategy` when windbot is enabled; when disabled it falls through
here and is simply unrecognized — conservative, not a special case),
`mm<...>` (the matchmaking queue's generated marker token), any arbitrary
unrecognized room name, and the blank command.

**Pairing key is the exact raw command string** — case and token order
matter. `edison,ns` and `ns,edison` are two different pairing pools and will
NOT pair with each other; `TCG` and `tcg` are likewise two different pools
(consistent with the case-sensitive room identity already described in §4).
This is a deliberate product decision: players expect to pair only with
someone who typed the exact same command.

**Lookup, inside `findOrCreateRoom`:**

- Pairing join → `YGOProRoomList.findJoinableByName(command, options)`. Every
  candidate with a matching name is scanned (not just the first), and ALL of
  the following are evaluated **per candidate, inside the same scan** — a
  candidate that fails any one of them is simply skipped, it can never
  shadow a later qualifying candidate:
  - `duelState === WAITING` and has a free seat (state- and seat-aware —
    see §4);
  - `password === ""` (`requireEmptyPassword`) — a passworded same-named
    room (e.g. `tcg#secret`) is skipped, not treated as a match-then-reject;
  - league compatibility for **guest** joiners only (`excludeRankedForGuest`):
    a joiner with no resolved ticket identity and no PIN skips any candidate
    whose league is ranked (Verified/External), because `RoomAdmission`
    hard-rejects a guest in a ranked room (JOINERROR + close, no spectator
    fallback) rather than seating or spectating it. Non-guest joiners
    (ticket or PIN) are not filtered by league — they keep the pre-existing
    behavior.
  - Found → join it.
  - Not found (no same-named room at all, or every same-named room is
    dueling/full/passworded/league-incompatible for this guest) → **create a
    new room** with the same name (`rankedOverride` per the calling
    strategy, same as any other creation).
- Non-pairing join → `findByNameAndPassword(command, password)` (first-match
  on the exact pair, state-blind), exactly as in §4 — a match joins whatever
  state that room is in (spectating included); no match **creates a new
  room** under that name and password rather than rejecting. See §8 for the
  trade-off this implies for a mistyped password.

**Never-spectate guarantee (mostly — see the seat-race caveat):** because a
pairing join either lands in a room that `findJoinableByName` just confirmed
is `WAITING` with a free seat, or creates a brand-new `WAITING` room, a
pairing join can **never** be routed into a dueling/mid-match room. The
unconditional-spectator path in `YGOProDuelingState.handleJoin` (§6) is
therefore unreachable for pairing joins — it only ever fires for non-pairing
joins (passworded rooms, or an unrecognized/arbitrary room name), where the
behavior is unchanged from before this feature.

Caveat: `hasFreeSeat()` (used by `findJoinableByName`) is an explicitly
**lock-free routing hint** — it does not hold the room's mutex. Two pairing
joiners can both observe the same last free seat as available and both get
routed to the same room; real admission (`RoomAdmission.decide`, inside
`room.mutex.runExclusive`) is the actual arbiter, and the loser of that race
degrades to **spectator** (no free seat left → `RoomAdmission` returns
`spectator`, per §6), not a rejection. This is the one gap in the
"never-spectate" guarantee: it holds for the routing decision, not for the
sub-mutex admission race on the very last seat.

## 6. Player vs spectator

Admission depends on the room state active when `JOIN` fires:

- **WAITING** (`YGOProWaitingState.handleJoin`): duplicate name → reject;
  otherwise `RoomAdmission.decide`
  (`src/shared/room/admission/domain/RoomAdmission.ts:32`):
  ranked + guest → reject; league doesn't admit → spectator;
  **no free seat → spectator**; else seated as player. A spectator can later be
  promoted via `TO_DUEL` (waiting state only).
- **RPS / ChoosingOrder / SideDecking / Dueling**: joiners are matched against
  existing players by `findReconnectingPlayer` (name, and for unranked rooms
  also remote address + original socket closed). Reconnect on match; otherwise
  **unconditionally a spectator** — mid-match joins never create players, and
  there is no "room is busy → go elsewhere" path.

## 7. What join does NOT use

- The HTTP room listings (`GET /api/getrooms`, `GET /api/rooms`) are read-only
  browse endpoints; the join pipeline never consults them.
- The HTTP matchmaking queue (`MatchmakingQueue`, `MatchmakingRoomFactory`) is
  a separate engine: it pairs players per format, creates a room with a
  generated `"<token>,mm<id>#<pass>"` string, and hands both players that exact
  string to send through the normal socket join pipeline. The only room-side
  marker is `room.isMatchmaking = true`. That generated string always carries
  an `mm<id>` token, which `isRecognizedToken` does not recognize — so
  matchmaking joins are never pairing joins (§5); they always go through the
  `findByNameAndPassword` lookup (§4/§5), resolving to their room by the exact
  generated `(name, password)` pair.

## 8. Known caveats (current behavior)

1. ~~Bare-token pairing works for the first two players, but a **third**
   sender of the same token while the duel is running silently becomes a
   spectator of two strangers.~~ **Fixed by the pairing feature (§5)** for any
   command where every token is recognized (or `casual`): a third sender gets
   a brand-new room instead of spectating, and a fourth sender pairs with the
   third's room rather than the still-dueling first one. The caveat still
   applies verbatim to commands with an unrecognized token or a password
   segment — those keep using `findByNameAndPassword` (state-blind,
   first-match on the pair) and can still land a joiner as a spectator of a
   dueling room when the pair matches.
2. Room identity is case-sensitive while rule resolution is not; clients that
   uppercase their commands partition themselves from clients that lowercase.
   The pairing feature (§5) inherits this exactly — `TCG` and `tcg` are two
   distinct pairing pools, not one.
3. `YGOProRoomList.findByName` (name-only, ignoring password) returns the
   first name match regardless of state; a caller routing through it alone
   can only ever reach the first same-named room. The join pipeline does not
   have this problem: non-pairing joins resolve by the full `(name,
   password)` pair via `findByNameAndPassword`, so a second, third, etc.
   same-named room under a different password is always independently
   reachable; pairing joins (§5) scan every same-named room via
   `findJoinableByName` and skip dueling/full/passworded ones. The caveat
   still applies to any other caller that uses plain `findByName` directly
   (e.g. `MatchmakingRoomFactory`'s name-collision check when minting a new
   matchmaking room name).
4. Because room identity for a non-pairing join is the exact `(name,
   password)` pair, there is no "wrong password" rejection on this path: a
   joiner who mistypes the password of an existing room does not get an
   error — they get a brand-new, empty room under that name and their typo'd
   password, indistinguishable in kind from any other room. This is a
   deliberate trade-off (see §4/§5): treating the full command string as the
   identity avoids `findByName`'s first-match collision with same-named
   pairing/other rooms, at the cost of silent typo-driven room creation
   instead of an explicit reject. Because there is no reject on this path, a
   mismatched password also no longer terminates the connection: the socket
   is never destroyed, and the joiner instead lands in the newly created room.
5. The 20-char `pass` ceiling applies to the entire command string; bot names
   are boot-validated against a 13-char budget that assumes short (≤3 chars +
   comma) format tokens.
