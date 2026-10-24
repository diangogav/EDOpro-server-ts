# Shared kernel room ports

Objective: remove the last `src/shared` → `src/edopro`/`src/ygopro` imports (group 2) by inverting them into ports.
Branch: `refactor/shared-kernel-room-ports`. Delivery: one PR, one commit per task (T4 alone). Runner: `pnpm test` (Jest), `npx tsc --noEmit`, `pnpm lint`.

## Specs

- S1: "el otro refactor es el grupo 2" — fix the four remaining violations: `DisconnectHandler`, `RoomFinder`, `YgoRoom`, `InMemoryLoadedBanListNamesProvider`.
- S2: No runtime behavior change: disconnect ordering (matchmaking dequeue → room lookup → per-flow branch), the order of checks inside each branch, un-awaited mutex calls, one `RoomFinder` searching both room lists (EDOPro clients, YGOPro clients, YGOPro `createdBySocketId` fallback), banlist name sets EDOPro first.
- S3: Shared defines ports; each flow implements them; wiring happens outside `src/shared` (composition in `src/index.ts` / servers / bootstrap).
- S4: A Biome `noRestrictedImports` rule prevents `src/shared/**` from importing `src/edopro`/`src/ygopro` again.
- S5: After this PR, update #435 (AGENTS.md) for the new ports and mark it ready.

## Tasks

| ID | Specs | Route | Status | Commit |
|----|-------|-------|--------|--------|
| T1 | S1, S2 | inline | done (type-only; tsc + 1043 room tests green) | 1b437217 |
| T2 | S1, S2, S3 | inline | done (RED 3 suites → GREEN; 314 tests) | 95c75d4a |
| T3 | S1, S2, S3 | inline | done (RED 4 suites → GREEN; 1132 tests) | c4678c3b |
| T4 | S1, S2, S3 | inline | done (RED order test → GREEN; branch bodies diffed identical; 2500 tests) | cb4481b7 |
| T5 | S4 | inline | done (planted alias + relative imports both rejected; repo lint clean) | 6b6d7e35 |
| T6 | S5 | inline | done (#435 rebased on #436, marked ready) | e8d369ab (on #435) |

- T1: `YgoRoom` uses `YgoClient` instead of `Client | YGOProClient`.
- T2: `InMemoryLoadedBanListNamesProvider` → per-flow `LoadedBanListNamesSource` + shared composite; single instance built outside shared.
- T3: `RoomFinder` → `RoomLocator` port, EDOPro and YGOPro locators, one shared finder wired in `src/index.ts`.
- T4: `DisconnectHandler` → `RoomDisconnectPolicy` (EDOPro, YGOPro) + `SocketDisconnectListener` (matchmaking); move branch code verbatim; retarget the six `DisconnectHandler*` suites.
- T5: Biome import restriction for `src/shared/**`.
- T6: update and un-draft #435.

Route evidence: units are sequential (T3/T4 share the connection handlers and servers), so no writer trigger; all inline.

## Log

- L1 (2026-10-24, user): "el otro refactor es el grupo 2... ya mergee btw" — then approved the group 2 design with "si".
- L2: Design from a read-only map of the four files: `YgoRoom` only uses the client types as annotations (members exist on `YgoClient`); `ExpressReconnectHandler` already inverts per flow with injected lambdas; mutex calls in disconnect paths are fire-and-forget and must stay so.
- L3: PR #436 opened with T1-T5 (1b437217, 95c75d4a, c4678c3b, cb4481b7, 6b6d7e35). Checks: `pnpm test` 2500 pass (254 suites), tsc app+test configs clean, biome lint clean; shared → client imports 0.
- L4: #435 rebased onto main and updated for the ports (18696da3); kept draft until #436 merges, per "el de agents debería ser después del otro refactor".
- L5 (user): "agreguemos los tests" — after review advisory R3-edopro-policy-branch-coverage. Added EdoproDisconnectPolicy.test.ts (7 cases: handles, empty room, host leaves, guest leaves, spectator leaves, last spectator deletes, unknown socket); two planted mutants (status 0xa, missing spectator deleteRoom) each fail one test.
- L6 (user): "si, agrega el test de ygopro" — after review advisory R3-ygopro-matchmaking-abort-branch-direct-test. Added YGOProDisconnectPolicy.test.ts (10 cases incl. check order); planted mutants (matchmaking/empty-room order swapped, missing player.destroy) each fail one test.
- L7 (user): "mergeado" — #436 merged as 6a05aced. #435 rebased onto it, persistence path in root AGENTS.md fixed, marked ready.
- L8 (user): "si" — after review advisories on #435: script matches exact AGENTS.md basenames that exist on disk (probed with SUBAGENTS.md and a deleted AGENTS.md), Key Commands lists the script, T6 commit column fixed.
- L9 (user): "corrige" — ygopro guide states which abandon path publishes GameOverDomainEvent; script reads ls-files -z (probed with a "módulo ñ" directory).
