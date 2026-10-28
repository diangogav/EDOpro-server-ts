# Reserved duels

A reserved duel is a room the server builds from a reservation written ahead of time, instead of from a client's join string. The reservation fixes the seats, the decks and the room's behaviour; the server claims it, plays it and records the outcome under the reservation id. The server never calls whoever issued the reservation and knows nothing about why it exists.

## Quick path

1. An issuer writes `duel:reservation:<id>` to Redis (TTL 10 min, `<id>` = 16 base62 chars).
2. Each human joins over WebSocket with a game ticket and the password `rv#<id>`.
3. The first participant claims it (`claim` Lua script, `RedisReservationStore`); the server writes the `reserved_duels` row and one `reserved_duel_participants` row per seat, opens the room and requests any WindBot seat.
4. Later participants are sent to the live room; their seat is marked joined once (`joined_at IS NULL`).
5. The duel starts by itself when both seats are taken and ready.
6. The outcome lands in `reserved_duels` exactly once; the reservation key is deleted when the room closes.

## The reservation (Redis)

```json
{
  "v": 1,
  "reservationId": "<id>",
  "format": "edison",
  "mode": "single",
  "participants": [
    { "seat": 0, "kind": "user", "userId": "<uuid>",
      "requiredDeck": { "main": [12345678], "extra": [87654321], "side": [] } },
    { "seat": 1, "kind": "windbot", "botName": "Haunted" }
  ],
  "options": { "spectators": false, "listed": false, "reconnect": false,
               "deckLock": "exact", "lobbyTimeoutSeconds": 120 },
  "claim": null
}
```

| Field | Meaning |
|---|---|
| `format` | A `formatRuleMappings` token (`room/domain/RuleMappings.ts`). Nothing else reaches the rule parser. |
| `mode` | `single`: one duel, a draw ends it. `match`: best of 3 with side decking. |
| `participants` | Exactly two seats, 0 and 1 (seat = team). At least one `user`. A `windbot` seat is requested by name. Seats are fixed: `TO_DUEL` / `TO_OBSERVER` are ignored in a reserved room. |
| `requiredDeck` | Optional per user seat. Checked after the banlist, in waiting and side decking. |
| `options.deckLock` | `exact`: each section must hold the required cards and a ready deck cannot change. `registered`: main + extra + side together must hold them (siding allowed). |
| `options.reconnect` | `false`: a human leaving ends the room. `true`: normal reconnect window and abandon grace. |
| `options.spectators` | Watch joins (`w,<roomId>`) admitted or refused. |
| `options.listed` | `false`: the room stays out of `/api/rooms`, `/api/getrooms` and the real-time room list (`GET-ROOMS`, `UPDATE-ROOM`, `REMOVE-ROOM`). |
| `options.lobbyTimeoutSeconds` | The first duel must start within it, or the room ends as `no_show`. |

### Claim (atomic, `CLAIM_RESERVATION_SCRIPT`)

| Result | When | Effect |
|---|---|---|
| `missing` | no key, or unreadable | JOINERROR |
| `not_participant` | the ticket user holds no `user` seat | JOINERROR; key untouched |
| `claimed` | `claim` was null | `claim = { instanceId, at }`, TTL raised to 6 h; room opened |
| `already_claimed_here` | claimed by this instance | sent to the live room; JOINERROR when it is gone |
| `claimed_elsewhere` | claimed by another instance | JOINERROR |

The instance id is `SERVER_INSTANCE_ID`; keep it stable and unique per deployment slot. It is required in production (`NODE_ENV=production`) when reserved duels are on: the server refuses to boot without it. Elsewhere it falls back to `default`.

## The records (Postgres, server-owned)

Created by the evolution-types migration `CreateReservedDuels1789300000000`.

| Writer | Write |
|---|---|
| Join (first participant) | `reserved_duels` row (`joined_at`) + participant rows. When the write reports an error the server checks whether the row was committed: if so the room opens; otherwise (or unknown) the room is closed as `room_closed` and the key released |
| Join (later participant) | `UPDATE reserved_duel_participants SET joined_at … WHERE joined_at IS NULL`; zero rows and no `reconnect` → JOINERROR |
| First duel start | `started_at`, `match_id`, only while the row is still open |
| Plugin `reserved-duels` (`GAME_OVER` with `reservationId`) | `outcome` `decided` / `draw`, `winner_seat`, `reason` (last game's win reason), `duels`, `started_at` when still empty |
| `FinalizeYGOProRoom` (room closed with no game over) | `outcome = abandoned`, `abandoned_by_seat`, `reason`; `started_at` too when the duel had started, so a quit right after the start is a started duel, never a pre-start void |
| Boot (`bootstrapReservedDuels`) | open rows of this instance → `abandoned` / `server_restart` |

Every terminal write is `… WHERE ended_at IS NULL`, and the core writes an abandon only when the room never dispatched a game over, so the plugin and the core never both close a row.

### Abandon reasons

| Reason | Seat | Cause |
|---|---|---|
| `disconnect` | the leaver | a human left (any time without `reconnect`; the last human with it; a cancelled match in the abandon grace) |
| `no_show` | first absent, else first unready human seat | lobby timeout |
| `bot_unavailable` | null | WindBot off, bot request failed, bot dropped, or the lobby timed out with every human ready |
| `room_closed` | null | any other teardown, or an unplayable reservation (unknown format, format contradicting the mode) |
| `server_restart` | null | boot sweep |

## Requirements

Reserved duels turn on when Postgres (`RANK_ENABLED=true`) and Redis (`USE_REDIS=true`, `REDIS_URI`) are both configured. Otherwise every `rv#` join is refused.
