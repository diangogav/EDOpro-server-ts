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
| T1 | S1, S2 | inline | done (type-only; tsc + room suites green) | pending-commit |
| T2 | S1, S2, S3 | inline | pending | |
| T3 | S1, S2, S3 | inline | pending | |
| T4 | S1, S2, S3 | inline | pending | |
| T5 | S4 | inline | pending | |
| T6 | S5 | inline | pending | |

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
