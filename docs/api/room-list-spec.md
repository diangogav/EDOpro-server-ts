# Room List API — Specification

## Context

Evolution's client Room Browser needs to list Mercury rooms with all labels
pre-resolved by the server. The client only renders — no mapping, no lookups.

---

## Endpoint

```
GET /api/rooms
```

### Query Parameters (all optional)

| Param    | Type   | Default | Description |
|----------|--------|---------|-------------|
| `status` | `string` | —     | Comma-separated: `waiting`, `dueling`, `rps`, `choosingOrder`, `sideDecking` |
| `open`   | `bool`   | —     | `true` = no password only, `false` = password only |
| `mode`   | `number` | —     | `0` Single, `1` Match, `2` Tag |

No params → all Mercury rooms.

---

### Response

```jsonc
{
  "rooms": [
    {
      "id":         1234,
      "command":    "M,tcg,lp8000",  // join key — pass this as CTOS_JOIN_GAME.pass (not displayed)
      "status":     "waiting",       // DuelState value
      "started":    false,           // false=waiting, true=any other state
      "private":    false,
      "canPlay":    true,            // waiting AND open slots
      "canWatch":   true,            // always true

      "banlist":    "2026.04 TCG",   // resolved name from BanList.name (via hash lookup)
      "rule":       "TCG",           // resolved label: "OCG" | "TCG" | "OCG/TCG" | "Pre-release" | "Anything Goes"

      "mode":       0,               // 0=Single, 1=Match, 2=Tag
      "bestOf":     1,
      "duelRule":   5,               // Master Rule 1-5
      "startLp":    8000,
      "timeLimit":  180,

      "players": [
        { "name": "DarkMagician", "position": 0, "team": 0 },
        { "name": "BlueEyes99",  "position": 1, "team": 1 }
      ],
      "maxPlayers": 2,
      "spectators": 0
    }
  ]
}
```

---

### Field Reference

| Field       | Type      | Source | Description |
|-------------|-----------|--------|-------------|
| `id`        | `number`  | `YgoRoom.id` | Room ID |
| `command`   | `string`  | `YGOProRoom.name` | Join key — client sends this as `CTOS_JOIN_GAME.pass`. Not displayed in UI. |
| `status`    | `string`  | `YgoRoom.duelState` | Granular lifecycle state |
| `started`   | `boolean` | computed | `duelState !== "waiting"` — quick filter for UI |
| `private`   | `boolean` | `password.length > 0` | Password required |
| `canPlay`   | `boolean` | computed | `!started && players.length < maxPlayers` |
| `canWatch`  | `boolean` | computed | Always `true` |
| `banlist`   | `string`  | `BanListRepo.findByHash(hash).name` | Human-readable banlist name |
| `rule`      | `string`  | resolved from `HostInfo.rule` numeric | `"OCG"`, `"TCG"`, `"OCG/TCG"`, `"Pre-release"`, `"Anything Goes"` |
| `mode`      | `number`  | `HostInfo.mode` | `0`=Single, `1`=Match, `2`=Tag |
| `bestOf`    | `number`  | `YgoRoom.bestOf` | Match count |
| `duelRule`  | `number`  | `HostInfo.duel_rule` | Master Rule version |
| `startLp`   | `number`  | `HostInfo.start_lp` | Starting LP |
| `timeLimit` | `number`  | `HostInfo.time_limit` | Seconds per turn |
| `players`   | `array`   | `YgoRoom._players` | Player list |
| `maxPlayers`| `number`  | `team0 + team1` | Total player slots |
| `spectators`| `number`  | `YgoRoom._spectators.length` | Spectator count |

#### `players[]`

| Field      | Type     | Source |
|------------|----------|--------|
| `name`     | `string` | `YgoClient.name` (null bytes stripped) |
| `position` | `number` | `YgoClient.position` |
| `team`     | `number` | `YgoClient.team` (0 or 1) |

#### Rule label resolution (server-side)

```
0 → "OCG"
1 → "TCG"
2 → "OCG/TCG"
3 → "Pre-release"
4 → "Anything Goes"
5 → "Anything Goes"
```

#### Banlist name resolution (server-side)

```typescript
YGOProBanListMemoryRepository.findByHash(room.banListHash)?.name ?? "No banlist"
```

---

## Implementation

### Server

1. **New controller**: `src/http-server/controllers/RoomListController.ts`
   - `YGOProRoomList.getRooms()` → filter by query params → map `toRoomListDTO()`

2. **New route**: `GET /api/rooms` in routes

3. **`toRoomListDTO()` on `YGOProRoom`** — builds the response shape, resolves:
   - `banlist`: lookup `BanListMemoryRepository.findByHash(hash).name`
   - `rule`: map numeric → string label
   - `started`: `duelState !== DuelState.WAITING`
   - `canPlay`: `!started && players.length < maxPlayers`
   - `canWatch`: `true`

### Data available (no model changes)

| Need | Source |
|------|--------|
| `duelState` | `YgoRoom.duelState` |
| `team0/team1` | `YgoRoom.team0/team1` |
| `players` with position, team | `YgoRoom._players` → `YgoClient` |
| `spectators.length` | `YgoRoom._spectators` |
| `password` | `YGOProRoom.password` |
| `HostInfo` fields | `YGOProRoom._hostInfo` |
| `banListHash` | `YGOProRoom._edoBanListHash ?? banListHash` |
| BanList name lookup | `YGOProBanListMemoryRepository.findByHash()` |

### Security

- Passwords NEVER in response
- Player IPs NEVER in response

---

## Client Usage

1. `GET /api/rooms` — all rooms, or `?status=waiting` for joinable only
2. Render room list — data is display-ready, no mapping needed
3. User clicks room:
   - `canPlay` → **Join** button
   - `canWatch` (and `started`) → **Spectate** button
   - `private` → prompt password first
4. Connect WebSocket → `CTOS_PLAYER_INFO` + `CTOS_JOIN_GAME`

---

## DuelState Reference

| Value            | `started` | `canPlay`        | `canWatch` |
|------------------|-----------|------------------|------------|
| `waiting`        | `false`   | if slots open    | Yes |
| `rps`            | `true`    | No               | Yes |
| `choosingOrder`  | `true`    | No               | Yes |
| `dueling`        | `true`    | No               | Yes |
| `sideDecking`    | `true`    | No               | Yes |

Joining a `started` room → server assigns spectator role automatically.
