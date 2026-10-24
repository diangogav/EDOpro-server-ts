# EDOPro Match Flow

EDOPro clients (Windows/Linux/Android/iOS). **Multirole** is the reference implementation for this flow; do not copy srvpro2 patterns from `src/ygopro/`. See the comparison table in the root `AGENTS.md`.

## Flow

1. **Connect**: `HostServer` (TCP) / `WSHostServer` (WS) → `src/socket-server/SocketConnectionHandler.ts` → shared `src/shared/messages/MessageEmitter.ts`, which frames bytes with `src/shared/messages/MessageProcessor.ts` and dispatches by `Commands` (`src/shared/messages/Commands.ts`).
2. **Create room**: an explicit `CREATE_GAME` packet carries the options as binary fields (`CreateGameMessage`: banlist hash, rules, password) → `room/application/GameCreatorHandler.ts` → `Room.createFromCreateGameMessage` → `room.waiting()` → `RoomList.addRoom`. With ranking enabled, the password field logs the user in (`UserAuth`).
3. **Join**: `room/application/JoinHandler.ts` finds the room by numeric id and exact password, then `room.emit("JOIN")`. No format-command parsing, no matchmaking, no windbot.
4. **Room states**: `Room` (`room/domain/Room.ts`, extends shared `YgoRoom`) swaps state objects in `room/domain/states/` — waiting → rps → choosing-order → dueling → side-decking → rps/choosing-order. Each state handles events emitted on the room.
5. **Deck validation**: `DeckCreator` with `CardSQLiteTYpeORMRepository` builds a shared `Deck`; `deck.validate()` runs the Chain of Responsibility in `src/shared/deck/domain/validators/`. Called in the waiting and side-decking states.
6. **Duel engine**: `DuelingState` spawns the C++ child process `./core/CoreIntegrator` (source in `core/src`, links libocgcore).
   - Engine → server: framed JSON on stdout, decoded by `JSONMessageProcessor` and routed by `type` (`MESSAGE`, `MESSAGE_ALL`, `MESSAGE_ALL_EXCEPT`, `FIELD`, `REPLAY`, `FINISH`, ...).
   - **Per-player filtering is done by the C++ core**; TypeScript only routes by `position`/`except`/`receiver`. Changing what a player sees means changing `core/src`.
   - Server → client packets are hand-written buffer classes in `messages/server-to-client/`.
   - Client → engine: `Commands.RESPONSE` → `room.sendMessageToCpp(...)` → `duel.stdin` (with drain backpressure).
7. **Game over**: `room/application/FinishDuelHandler.ts` → `MatchLifecycleHooks.runEnding` → `RoomList.deleteRoom` → `GameOverDomainEvent` on the `EventBus` (consumed by plugins). If the match is not finished, it moves to `sideDecking()`.
8. **Reconnect/disconnect**: reconnection token issued in `WaitingState`; mid-duel reconnect uses the core's `RECONNECT` message; disconnects reach `room/application/EdoproDisconnectPolicy.ts` through the shared `DisconnectHandler`.

## Resources

- Cards: SQLite via TypeORM (`card/infrastructure/sqlite/`), `.cdb` files merged from `resources/edopro/databases`.
- Banlists: `EdoProBanListLoader` → `BanListMemoryRepository`, looked up by **hash**.
- Scripts: read by the C++ core from `resources/current/edopro/scripts`.

## Cross-flow pitfall

`JoinHandler.findRoom` also resolves `YGOProRoom`s from `YGOProRoomList`, so an EDOPro-protocol join can land in a YGOPro room.
