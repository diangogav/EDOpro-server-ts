# YGOPro Match Flow

srvpro2-compatible server for YGOPro clients (Koishi, YGO Mobile, YGOPro). **srvpro2** is the source of truth for protocol behavior; do not copy Multirole patterns from `src/edopro/`. See the comparison table in the root `AGENTS.md`.

## Flow

1. **Connect**: `YGOProServer` (TCP, `config.servers.mercury.port` — "Mercury" is this TCP server, not WebSocket) / `WSYGOProServer` (WS, gated by `HandshakeTicketAuthenticator`) → `src/socket-server/YGOProConnectionHandler.ts`. Frames wait on the `ready` (auth) promise, then go to the shared `src/shared/messages/MessageEmitter.ts`; matchmaking opcodes go through `matchmakingConnectionFactory`.
2. **Create room — inside JOIN**: `YGOProGameCreatorHandler` is a no-op. `room/application/YGOProJoinHandler.ts` decodes `YGOProCtosJoinGame`, splits `pass` into `command#password`, and resolves a join strategy (`room/application/join-strategies/composeJoinStrategies.ts`, in order): `AIJoinToken` (`AIJOIN#`) → `WindBot` (`ai`) → `Invite` (`j,`) → `Watch` (`w,<id>`) → `Ticket` (authenticated socket, forces ranked) → `Default` (`findOrCreateRoom`).
3. **Room options**: `YGOProRoom.create` (`room/domain/YGOProRoom.ts`) parses comma-separated format tokens through `RuleMappings.ts` (`ruleMappings` → `formatRuleMappings` → `priorityRuleMappings`), resolves `cardPool` (`standard`/`extended`/`rush`) via `formatCardPools`, and decides ranked/casual with `RoomLeague.determine`. Matchmaking (`matchmaking/application/MatchmakingRoomFactory.ts`) reuses `YGOProRoom.create`.
4. **Room states**: `YGOProRoom` (extends shared `YgoRoom`) swaps `room/domain/states/YGOPro*State.ts` — Waiting → RockPaperScissor → ChoosingOrder → Dueling → SideDecking → RPS/ChoosingOrder. Admission goes through `room/admission/application/AdmitToRoom.ts`.
5. **Deck validation**: `deck/domain/YGOProDeckValidator.ts` = shared validators + ygopro-only `CardAvailabilityValidationHandler` (srvpro2 bitwise scope check). Runs in waiting and side-decking only when `shouldValidateDeck()` is true.
6. **Duel engine**: `YGOProDuelingState` builds `OCGCore` (`ocgcore-worker/ocgcore.ts`), a **WASM ocgcore in a worker thread** (`yuzuthread` + `koishipro-core.js`), fed with the room's pool scripts and card reader.
   - Messages are typed `YGOProMsg*` objects from `ygopro-msg-encode`, passed through `GameMessageMiddleware`.
   - **Per-player filtering is done in TypeScript**: `OCGCore.deliverToTargets` sends `playerView(side)` / `teammateView()` / `observerView()`.
   - Client → engine: `Commands.RESPONSE` → `ocgCore.setResponse` → `advance`.
7. **Game over**: a `YGOProMsgWin` middleware hook → `determineNextPhase` → `MatchLifecycleHooks.runEnding` → `finalizeWithReplays` (YRP + EVRP built in TS) → `GameOverDomainEvent` → room removed; otherwise `transitionToSideDecking`. Abandon paths: `EndMatchByAbandon`, `AbandonBetweenDuels`, `FinalizeYGOProRoom`.
8. **Spectators/reconnect/disconnect**: spectators join with `w,` or by joining a dueling room; `EXPRESS_RECONNECT` + `sendReconnectTimeLimitAndResponseState`; disconnects use the `YGOProRoom` branch of shared `DisconnectHandler` (with windbot and matchmaking teardown).

## Resources

- `ygopro/YGOProResourceLoader.ts` (singleton) builds one card reader and script path list per pool from `resources.manifest.json`; `card/infrastructure/CardYGOProRepository.ts` reads cards for a given `cardPool`. The `rush` pool replaces standard instead of extending it.
- Extended pools search extensions before standard (`extendedSearchOrder` in `PoolSelection.ts`), so prerelease rows and script fixes win, like srvpro2's `expansions/`.
- Banlists: `YGOProBanListLoader` → `YGOProBanListMemoryRepository`, looked up by **lflist index**. Rooms also resolve the EDOPro banlist hash by name, so EDOPro banlists must load first.
- Format sources live in `resources/ygopro/alternatives/<format>/` (`cards.cdb`, `lflist.conf`, `script/`), assembled into the gitignored `resources/current/`.

## SOPs

### Adding a room format

1. Add it to `formatRuleMappings` in `room/domain/RuleMappings.ts` (`rule`, `duel_rule`, `lflist`, `time_limit`).
2. If it needs prerelease/art/rush cards, map it in `formatCardPools`.
3. Add its resources under `resources/ygopro/alternatives/<format>/` and register them in `resources.manifest.json`.
4. Add tests in `room/domain/YGOProRoom.test.ts`.

### Adding a message handler

1. Find the command code in `src/shared/messages/Commands.ts` (shared with EDOPro — never change existing values).
2. Handle it in the relevant `YGOPro*State`.
3. Compare behavior with the srvpro2 source.
