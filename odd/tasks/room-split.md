# Room split (audit step 4)

Objective: inject the collaborators of `Room`, `YGOProRoom` and their states instead of building or importing them from domain code, and shrink `Room`, without changing runtime behavior.
Branches: one per work unit, from main. Delivery: one PR per unit (stacked only when a unit depends on an unmerged one). Test runner: `pnpm test` (jest), plus `pnpm check` and `tsc --noEmit -p tsconfig.test.json`.

## Specs

- S1. The audit plan the user set: "Plan de auditoría por pasos: 1) limpieza segura, 2) fronteras/lints + ARCHITECTURE.md, 3) consolidar, 4) migraciones grandes, 5) mover reglas al servidor." This document covers step 4.
- S2. Every unit is behavior-preserving: wire output (STOC frames, message order, `/api/getrooms`, ADD-ROOM/UPDATE-ROOM), persisted data (match results, ban list names and hashes, stats) and room lifecycle stay the same. Behavior a unit moves that has no test gets a characterization test first, run green on the old code.
- S3. Each unit removes its lines from `KNOWN_DOMAIN_LEAKS` in `src/architecture/boundaries.test.ts`; the list never gains a line except when a file move renames one.
- S4. Composition, approved by the user ("si"): rooms receive their collaborators through an explicit `deps` argument on `create*`; `RoomState` and `RuleMappings` use a static registration in `src/bootstrap`, like `YGOProRoom.useBanListHashLookup`.
- S5. Out of scope: the shared seating template for both rooms (it changes wire message order) and unifying `removeSpectator` (YGOProRoom's override skips the mutex).

## Tasks

Order approved by the user. Leaks = lines removed from `KNOWN_DOMAIN_LEAKS` (46 at start).

- T1 [S2,S3] delete the unused `YGOProBanListMemoryRepository` import in YGOProWaitingState — 1 leak — inline — done (branch refactor/room-split-state-ports)
- T2 [S2,S3] domain ports for the EDOPro states (`Reconnect`, `JoinToDuelAsSpectator`, `DeckCreator`, `UserAuth`/`AuthenticatePlayer`, `FinishDuelHandler`) — 13 leaks — inline — done (same branch; `Room -> AuthenticatePlayer` moved into Room's state factory, removed with T4)
- T3 [S2,S3] domain ports for the YGOPro states (`AbandonBetweenDuels`, `FinalizeYGOProRoom`, `YGOProDeckCreator`, `AdmitToRoom`; `AdmissionTarget` to domain) — 6 leaks — risk: abandon publishes `GameOverDomainEvent` — done (branch refactor/room-split-ygopro-state-ports; `YGOProRoom -> AbandonBetweenDuels/FinalizeYGOProRoom` moved into its state factory, removed with T5)
- T4 [S2,S3,S4] EDOPro room collaborators through `create*`, timer callbacks — 9 leaks — characterization tests for timeout win and room expiry first — pending
- T5 [S2,S3,S4] YGOPro room collaborators through `create` (4 callers) — 6 leaks — pending
- T6 [S2,S3,S4] `RoomState` ports for match lifecycle hooks and room-list broadcast (replace `container.get` and `WebSocketSingleton`) — 4 leaks — about 17 test mocks to rewrite — pending
- T7 [S2,S3,S4] ban list catalog ports and the RuleMappings logger — 5 leaks — high risk: persisted data and `/api/getrooms` — pending
- T8 [S2] extract the EDOPro core-process channel and turn-order bookkeeping from `Room` — 0 leaks — queue/backpressure tests first — pending
- T9 [S3] move the socket adapters to `shared/socket/infrastructure` — 2 leaks — pending

## Log

- L1 User (2026-11-02), original audit request: "vamos a hacer una revisión profunda de EDOpro-server-ts (/home/diango/code/evolution/EDOpro-server-ts) para limpiarlo y definir sus responsabilidades, igual que hicimos con evolution-card-game y evolution-api." with the plan quoted in S1.
- L2 Steps 1-3 shipped in PRs #452-#457: engine imports 10 → 0, domain imports 69 → 46.
- L3 Read-only map at bd81e479: Room has 9 responsibility clusters and 2 direct tests; YGOProRoom is well covered; the 46 domain leaks group into 8 root causes; production calls `Room.create*` from 2 places and `YGOProRoom.create` from 4.
- L4 User approved the unit order and the mixed composition (S4): "si".
- L5 T1+T2: `src/edopro/room/domain/RoomStatePorts.ts` declares PlayerReconnector, SpectatorJoiner, DeckBuilder, PlayerAuthenticator and FinishDuel. The EDOPro states use them, and Room wires the same implementations: one AuthenticatePlayer per waiting() instead of one per join, both stateless; FinishDuelHandler is built when the duel ends, as before. KNOWN_DOMAIN_LEAKS 46 → 33. tsc, pnpm check and pnpm test (2710) pass.
- L6 T1+T2 merged as #458. T3: `src/ygopro/room/domain/RoomStatePorts.ts` declares YGOProDeckBuilder, PlayerAdmission, MatchAbandonment and RoomFinalizer; `AdmissionTarget` moved to `src/ygopro/room/admission/domain`. YGOProRoom passes the static `AbandonBetweenDuels` and `FinalizeYGOProRoom` classes themselves, so every call reaches the same function with the same arguments. KNOWN_DOMAIN_LEAKS 33 → 29. tsc, pnpm check and pnpm test (2710) pass.
