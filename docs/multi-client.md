# Multi-client architecture

The server runs two independent match flows over the same shared kernel. Read the module guide before touching a flow: [`src/edopro/AGENTS.md`](../src/edopro/AGENTS.md), [`src/ygopro/AGENTS.md`](../src/ygopro/AGENTS.md).

## Comparison

| Aspect               | EDOPro (`src/edopro/`)                          | YGOPro (`src/ygopro/`)                                     |
| -------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| Reference            | Multirole                                       | srvpro2                                                    |
| Servers              | `HostServer` / `WSHostServer`                   | `YGOProServer` ("Mercury" TCP) / `WSYGOProServer` (ticket) |
| Room creation        | Explicit `CREATE_GAME` with binary options      | Inside JOIN, from the `command#password` string            |
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

## Boundaries

**Shared kernel**: `src/shared/` never imports `src/edopro/` or `src/ygopro/` (Biome `noRestrictedImports` fails the lint). When shared code needs protocol behavior, define a port in `src/shared/` and implement it in each flow. Wire the implementations in `src/bootstrap/` (`createRoomFinder`, `createDisconnectHandler`, `createLoadedBanListNamesProvider`). A new room type registers its locator and disconnect policy there.

**Engine and domain**: `src/edopro/` and `src/ygopro/` never import each other, and a `domain/` file never imports `application/`, `infrastructure/`, the outer layers or infrastructure packages. `src/architecture/boundaries.test.ts` enforces both as a ratchet: its known-leak lists only shrink, so never add a line to them to make a new import pass. See [architecture §12](./architecture.md#12-boundary-rules).

## Game over event

`GameOverDomainEvent` is published in three places that must stay in sync: `FinishDuelHandler` (EDOPro), `YGOProDuelingState` and `EndMatchByAbandon` (YGOPro).
