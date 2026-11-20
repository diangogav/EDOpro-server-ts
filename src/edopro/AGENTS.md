# EDOPro Match Flow

EDOPro clients (Windows/Linux/Android/iOS). **Multirole** is the reference implementation for this flow; do not copy srvpro2 patterns from `src/ygopro/`. See the comparison table in [`docs/multi-client.md`](../../docs/multi-client.md).

## Flow

1. **Connect**: `HostServer` (TCP) / `WSHostServer` (WS) → `src/socket-server/SocketConnectionHandler.ts` → shared `src/shared/messages/MessageEmitter.ts`, which frames bytes with `src/shared/messages/MessageProcessor.ts` and dispatches by `Commands` (`src/shared/messages/Commands.ts`).
2. **Create room**: an explicit `CREATE_GAME` packet carries the options as binary fields (`CreateGameMessage`: banlist hash, rules, password) → `room/application/GameCreatorHandler.ts` → `Room.createFromCreateGameMessage` → `room.waiting()` → `RoomList.addRoom`. With ranking enabled, the password field logs the user in (`UserAuth`). The one room no client hosts is a Speed Duel room for clients of the YGOPro server: `room/application/EdoproSpeedDuelRooms.ts` builds it with `Room.create` from `room/domain/SpeedDuelRoomPreset.ts`, marks it `createdByServer` and lists it; its first player enters through `EdoproRoomEntry` and is the host.
3. **Join**: `room/application/JoinHandler.ts` finds the room by numeric id and exact password, then `room.emit("JOIN")`. No format-command parsing, no matchmaking, no windbot.
4. **Room states**: `Room` (`room/domain/Room.ts`, extends shared `YgoRoom`) swaps state objects in `room/domain/states/` — waiting → rps → choosing-order → dueling → side-decking → rps/choosing-order. Each state handles events emitted on the room.
5. **Deck validation**: `DeckCreator` with `CardSQLiteTYpeORMRepository` builds a shared `Deck`; `deck.validate()` runs the Chain of Responsibility in `src/shared/deck/domain/validators/`. Called in the waiting and side-decking states.
6. **Duel engine**: `DuelingState` spawns the C++ child process `./core/CoreIntegrator` (source in `core/src`, links libocgcore).
   - Engine → server: framed JSON on stdout, decoded by `JSONMessageProcessor` and routed by `type` (`MESSAGE`, `MESSAGE_ALL`, `MESSAGE_ALL_EXCEPT`, `FIELD`, `REPLAY`, `FINISH`, ...).
   - **Per-player filtering is done by the C++ core**; TypeScript only routes by `position`/`except`/`receiver`. Changing what a player sees means changing `core/src`.
   - Server → client packets are hand-written buffer classes in `messages/server-to-client/`.
   - Client → engine: `Commands.RESPONSE` → `room.sendMessageToCpp(...)` → `CoreChannel` (`room/domain/CoreChannel.ts`) → `duel.stdin`, queued with drain backpressure. `CoreChannel` also counts the IPC metrics logged with `IPC_METRICS_ENABLED=true`.
7. **Game over**: `room/application/FinishDuelHandler.ts` → `MatchLifecycleHooks.runEnding` → `RoomList.deleteRoom` → `GameOverDomainEvent` on the `EventBus` (consumed by plugins). If the match is not finished, it moves to `sideDecking()`.
8. **Reconnect/disconnect**: reconnection token issued in `WaitingState`; mid-duel reconnect uses the core's `GET_FIELD` snapshot and `RECONNECT` message, and a player back by token is sent the room settings and seats first ([room re-entry §3](../../docs/room-reentry.md)); disconnects reach `room/application/EdoproDisconnectPolicy.ts` through the shared `DisconnectHandler`. A waiting room ends with its host, except one the server created, which stays while another player is seated and makes that player its host (`Room.passHostOn`).

## Resources

- Cards: SQLite via TypeORM (`card/infrastructure/sqlite/`), `.cdb` files merged from `resources/edopro/databases`.
- Banlists: `EdoProBanListLoader` → `BanListMemoryRepository`, looked up by **hash**.
- Scripts: read by the C++ core from `resources/current/edopro/scripts`.

## Cross-flow pitfall

`JoinHandler` looks the room up with the shared `RoomFinder.findById`, which searches EDOPro rooms and then YGOPro rooms (`createRoomFinder`), so an EDOPro-protocol join can land in a YGOPro room.

The reverse crossing is deliberate: `room/application/EdoproRoomEntry.ts` seats a socket from the YGOPro server in an EDOPro room (join command `edo,<roomId>`, see [join commands §10](../../docs/join-commands.md)). `room/application/EdoproSpeedDuelRooms.ts` is the second crossing: it finds or opens a Speed Duel room for such a socket (`speed` token, [join commands §11](../../docs/join-commands.md)) and never seats it as a spectator. Such a socket is marked `bridgedFromYgopro`; its decks are built with `fromForeignCardPool`, which resolves codes of the YGOPro pool through `deck/domain/ForeignPrintings.ts`.
