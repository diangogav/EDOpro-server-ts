# Multi-client architecture

The server runs two independent match flows over the same shared kernel. Read the module guide before touching a flow: [`src/edopro/AGENTS.md`](../src/edopro/AGENTS.md), [`src/ygopro/AGENTS.md`](../src/ygopro/AGENTS.md).

## Comparison

| Aspect               | EDOPro (`src/edopro/`)                          | YGOPro (`src/ygopro/`)                                     |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Reference            | Multirole                                       | srvpro2                                                    |
| Servers              | `HostServer` / `WSHostServer`                   | `YGOProServer` ("Mercury" TCP) / `WSYGOProServer` (ticket) |
| Room creation        | Explicit `CREATE_GAME` with binary options; Speed Duel rooms opened by the server for YGOPro-server clients | Inside JOIN, from the `command#password` string            |
| Join routing         | Room id + password                              | Join strategy chain (AI, windbot, invite, watch, ticket)   |
| Matchmaking, windbot | No                                              | Yes                                                        |
| Engine               | C++ `CoreIntegrator` child process (JSON stdio) | WASM ocgcore in a worker thread                            |
| Per-player filtering | In the C++ core                                 | In TS (`OCGCore.deliverToTargets`)                         |
| Message encoding     | Hand-written buffers                            | `ygopro-msg-encode`                                        |
| Deck validator       | `Deck.validate()` (shared chain)                | `YGOProDeckValidator` (shared chain + availability)        |
| Cards                | SQLite `CardEntity`                             | `YGOProResourceLoader`, one reader per `cardPool`          |
| Banlist key          | Hash                                            | lflist index                                               |
| Room list            | `RoomList`                                      | `YGOProRoomList`                                           |

## Shared by both flows

Changes here affect both flows:

- `YgoRoom` (mutex, state).
- `RoomState` in `src/shared/room/domain/` (match start hooks, plugin duel events, `:score`). Each flow's states extend `EdoproRoomState` or `YGOProRoomState`, which relay chat and emotes in their own wire format.
- `Commands` and `MessageProcessor`, `MessageEmitter` (also dispatches the `MATCHMAKING_*` opcodes YGOPro uses) and `PlayerInfoMessage` in `src/shared/messages/`.
- `UserAuth` (returns a `ServerErrorMessage`; each flow encodes it).
- `RoomFinder` and `DisconnectHandler` (they only orchestrate; each flow plugs in a `RoomLocator` and a `RoomDisconnectPolicy`).
- Deck validators, `EventBus`, `MatchLifecycleHooks` and plugins.

### Skill Cards

A Skill (card type `0x8000000`) is sent in the Main Deck list, as EDOPro does, and the shared deck rules follow Multirole:

- `DeckLimitsValidationHandler` leaves the Skills of the Main Deck list out of the Main Deck size. The Side Deck size counts its Skills.
- `Deck.validate()` answers `DECK_TOO_MANY_SKILLS` (`0xD`) for more than one Skill in the Main Deck list. EDOPro rooms pass `contentChecked: false` when the host chose not to check decks, which skips this rule and no other.
- Between duels, EDOPro rooms accept a side deck only when `Deck.keepsSideDeckingShape()` holds: the same Main Deck size without Skills, the same Extra Deck size and at most one Skill in the Main Deck list (or as many as the deck already had). So a Skill can be swapped, added from the Side Deck or moved to it.

Only the EDOPro card pool has Skills, so YGOPro rooms see no difference. `YGOProDeckValidator` does not chain the Skill limit. A client seated from the YGOPro server receives `DECK_TOO_MANY_SKILLS` as deck error kind 13, which the YGOPro protocol does not define.

## Crossing between flows

A client on the YGOPro server can sit in an EDOPro room with the join command
`edo,<roomId>` ([join commands §10](./join-commands.md#10-edopro-room-joins-edoroomidpassword)).
The same client asks for a Speed Duel room with the `speed` token
([join commands §11](./join-commands.md#11-speed-duel-rooms-speed)): the EDOPro
flow opens the room itself and seats the client the same way.
These are the deliberate crossings: `src/ygopro/` calls the shared
`ForeignRoomEntry` and `ForeignSpeedDuelRooms` ports, `src/edopro/` implements
them (`EdoproRoomEntry`, `EdoproSpeedDuelRooms`), and `src/index.ts` wires
them. In the other direction the bridge reads the rows of an EDOPro ban list
through the shared `BanListsByHash` port, to announce the hash its client
computes for a whitelist only the EDOPro flow loads. After the entry the EDOPro room owns the socket and
keeps speaking its own wire format; the socket it was handed
(`src/ygopro/edopro-bridge/`) translates both ways, so the client never sees
it.

## Boundaries

**Shared kernel**: `src/shared/` never imports `src/edopro/` or `src/ygopro/` (Biome `noRestrictedImports` fails the lint). When shared code needs protocol behavior, define a port in `src/shared/` and implement it in each flow. Wire the implementations in `src/bootstrap/` (`createRoomFinder`, `createDisconnectHandler`, `createLoadedBanListNamesProvider`). A new room type registers its locator and disconnect policy there.

**Engine and domain**: `src/edopro/` and `src/ygopro/` never import each other, and a `domain/` file never imports `application/`, `infrastructure/`, the outer layers or infrastructure packages. `src/architecture/boundaries.test.ts` enforces both as a ratchet: its known-leak lists only shrink, so never add a line to them to make a new import pass. See [architecture §12](./architecture.md#12-boundary-rules).

## Game over event

`GameOverDomainEvent` is published in three places that must stay in sync: `FinishDuelHandler` (EDOPro), `YGOProDuelingState` and `EndMatchByAbandon` (YGOPro).
