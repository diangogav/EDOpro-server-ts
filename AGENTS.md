# Evolution Server

TypeScript server for EDOPro and YGOPro clients, built with Hexagonal/DDD architecture.

This file holds only what applies to every change. When your task matches a row in [Read before you work](#read-before-you-work), read that document first. Code that breaks these rules is rejected.

## Rules for every change

### Architecture

- Business logic lives in `domain/`. Dependencies point inward: a `domain/` file never imports `application/` or `infrastructure/`.
- `src/shared/` never imports `src/edopro/` or `src/ygopro/`, and those two never import each other.
- The known-leak lists in `src/architecture/boundaries.test.ts` only shrink. Never add a line to make a new import pass.
- New event subscribers ship as plugins under `src/plugins/`, never as hardwired composition-root code.
- Use Chain of Responsibility for complex validations (for example, deck rules).
- Manage dependencies with `diod` or constructor injection.

### Code

- `public`, `private` and `protected` are always explicit.
- No console logs: use the `Logger` domain service.
- `PascalCase` for classes, `camelCase` for variables, `UPPER_SNAKE_CASE` for constants.
- Use `@edopro/*` for imports from `src/edopro/` when possible.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Tests are co-located next to their source. `describe` the unit and write `it` as the behavior, in English, present tense, no "should".

### Safety

- Use absolute paths for file operations.
- Never edit `migrations/` manually after they are applied.
- Run `pnpm lint` and `pnpm test` before finishing.

## Read before you work

| When your task...                                        | Read first                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------------------------- |
| Implements a feature or use case                         | [Feature implementation](./docs/development-workflows.md#feature-implementation) |
| Creates a module or architecture component               | [Module creation](./docs/development-workflows.md#module-creation)         |
| Adds a field, updates the schema or adds an entity       | [Database migration](./docs/development-workflows.md#database-migration)   |
| Writes tests or fixes a bug                              | [Testing conventions](./docs/testing.md)                                   |
| Touches the EDOPro flow                                  | [`src/edopro/AGENTS.md`](./src/edopro/AGENTS.md)                           |
| Touches the YGOPro flow                                  | [`src/ygopro/AGENTS.md`](./src/ygopro/AGENTS.md)                           |
| Touches shared code, or compares the two flows           | [Multi-client architecture](./docs/multi-client.md)                        |
| Publishes or changes `GameOverDomainEvent`               | [Game over event](./docs/multi-client.md#game-over-event)                  |
| Adds an event subscriber                                 | [Server plugins](./docs/plugins.md)                                        |
| Needs boot order, dispatch, persistence or invariants    | [Architecture](./docs/architecture.md)                                     |
| Changes the join command format or rule tokens           | [Join commands](./docs/join-commands.md)                                   |
| Changes client room options or banlist indices           | [Room options](./docs/room-options.md)                                     |
| Changes reconnection, spectating or watching             | [Room re-entry](./docs/room-reentry.md)                                    |
| Changes reserved duels                                   | [Reserved duels](./docs/reserved-duels.md)                                 |
| Changes metrics or sizes the server                      | [Metrics](./docs/metrics.md), [Memory capacity](./docs/memory-capacity.md) |

## Project map

| Component   | Location                                   | Stack                                            |
| ----------- | ------------------------------------------ | ------------------------------------------------ |
| Core domain | `src/edopro/`, `src/shared/`               | TypeScript, DDD                                  |
| API         | `src/http-server/`                         | Express, Diod                                    |
| Realtime    | `src/socket-server/`                       | WS, Net                                          |
| Persistence | `src/evolution-types/src`, `src/shared/db` | TypeORM; PostgreSQL (users), SQLite (game), Redis (cache) |
| Clients     | `src/edopro/`, `src/ygopro/`               | Custom protocols                                 |

## Commands

| Command                         | Description                                                            |
| ------------------------------- | ---------------------------------------------------------------------- |
| `pnpm dev`                      | Start development server (port 9229)                                   |
| `pnpm build`                    | Build for production                                                   |
| `pnpm test`                     | Run all tests                                                          |
| `pnpm test path/to/file`        | Run one test file                                                      |
| `pnpm lint`                     | Check code style                                                       |
| `pnpm lint:fix`                 | Fix code style                                                         |
| `scripts/generate-claude-md.sh` | Link a `CLAUDE.md` to every tracked `AGENTS.md` (run after adding one) |

## Path aliases

`@edopro/*` → `src/edopro/*`, `@shared/*` → `src/shared/*`, `@ygopro/*` → `src/ygopro/*`, `@plugins/*` → `src/plugins/*`, `@test-support/*` → `src/test-support/*`.
