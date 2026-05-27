# Testing conventions

How we write tests in EDOpro-server-ts: where they live, how we build test data, how we mock, and how we format them. The goal is one consistent pattern so any test reads like the one next to it.

> **Status:** This is the target standard. The suite is being migrated incrementally — legacy tests under the root `tests/` folder still follow older patterns and are being moved to co-location module by module. New tests **must** follow this doc.

## Quick path — writing a new test

1. **Co-locate it.** Put `Thing.test.ts` next to `Thing.ts` inside `src/`. Never add tests to the root `tests/` folder.
2. **Build domain objects with a Mother.** Use (or create) an Object Mother for shared domain entities. Use a local `make*` factory only for stubs specific to that one suite.
3. **Mock infra with the shared doubles.** `LoggerMock`, `SocketMock`, `MessageRepositoryMock` for ubiquitous interfaces; `jest.mock()` for module singletons; `mock<T>()` (jest-mock-extended) for one-off interface mocks.
4. **Reset singletons** in `afterEach` (e.g. `WindbotModule.resetForTests()`, `JoinStrategyRegistry.reset()`).
5. **Format:** 2-space indentation — your editor applies it via `.editorconfig`.

## Where tests live

| Rule | Detail |
|------|--------|
| Co-location | `src/<feature>/Thing.test.ts` sits next to `src/<feature>/Thing.ts`. The test travels with the code it tests. |
| Shared test support | Mothers and mocks live in `src/test-support/` (`mothers/`, `mocks/`), importable from any co-located test. |
| Legacy `tests/` | Being phased out. Do not add to it. When you touch a module, migrate its legacy test to co-location. |

**Why co-location:** a mirrored `tests/` tree drifts from `src/` (it already did). The test next to the source is discovered together, refactored together, and never goes stale.

## Building test data

Decide by **what** you are building:

| You are building… | Use | Why |
|-------------------|-----|-----|
| A shared **domain entity** (Client, Player, Room, YGOProRoom, UserProfile, Game) | **Object Mother** | One canonical builder. Faker defaults expose hidden coupling; override only the field under test. |
| A **local stub** used by one suite (a fake repo, provider, socket) | **Inline `make*` factory** | Lightweight, self-contained, fresh per test. No need to share. |

### Object Mother (domain entities)

A static `create(params?: Partial<Props>)` returning a real domain object, with sensible faker-backed defaults:

```ts
export class ClientMother {
  static create(params?: Partial<ClientMotherProps>): Client {
    return new Client({
      name: params?.name ?? faker.person.firstName(),
      team: params?.team ?? faker.number.int({ min: 0, max: 1 }),
      // ...other faker defaults
      ...params,
    });
  }
}

// usage — override only what the test cares about
const client = ClientMother.create({ id: "1" });
```

Rule: **one Mother per shared domain entity.** If an entity is built more than one way across the suite, that is a bug to consolidate (see Migration targets).

### Inline factory (local stubs)

For doubles that only one suite needs — compose with an `overrides` parameter:

```ts
const makeRepo = (overrides: Partial<BotlistRepository> = {}): BotlistRepository => ({
  findAll: jest.fn().mockReturnValue([]),
  findByName: jest.fn().mockReturnValue(null),
  ...overrides,
});
```

## Mocking

| Need | Use |
|------|-----|
| Ubiquitous infra interface (Logger, Socket, MessageRepository) | Shared **Mock class** from `src/test-support/mocks/` |
| A module-level singleton (e.g. `WebSocketSingleton`) | `jest.mock("...path...")` at the top of the file |
| A one-off interface mock | `mock<T>()` from **jest-mock-extended** (type-safe, no hand-rolled `jest.fn()` objects) |
| A spy on a real method | `jest.spyOn(obj, "method")` |

**Pick one for one-off interface mocks: `mock<T>()`.** Do not hand-roll ad-hoc `jest.fn()` stub objects for interfaces a Mock class or `mock<T>()` already covers.

Always reset shared singleton state in `afterEach` so suites don't leak into each other.

## Formatting & naming

| Topic | Decision |
|-------|----------|
| Indentation | **2 spaces** (no tabs), applied by editors via `.editorconfig`. Not CI-gated — the eslint config intentionally omits stylistic rules. |
| `describe` | The unit under test: `describe("WindbotModule")` or `describe("WindbotModule.requestBot()")`. |
| `it` | Behavior, present tense, no "should": `it("throws when the token is missing")`. |
| No scaffolding | No `PR-N` / `REQ-XXX` labels in comments or test names. Comments explain *why*, not *what*. |

## PR checklist

- [ ] Test is co-located in `src/`, next to its source.
- [ ] Shared domain objects built via a Mother; local stubs via `make*` factories.
- [ ] Infra mocked via shared Mock classes / `mock<T>()`; singletons reset in `afterEach`.
- [ ] 2-space indentation; `describe`/`it` follow the naming convention.
- [ ] `npm run lint` and the test suite pass.

## Migration targets (incremental)

Known consolidation work, done opportunistically as modules are touched:

| Target | Status |
|--------|--------|
| `YGOProRoom` built two ways | ✅ Consolidated onto `YGOProRoomMother`. |
| Mothers & mocks under `tests/` | ✅ Moved to `src/test-support/`. |
| 2-space formatting | ✅ `.editorconfig` added (editor-applied, not CI-gated). |
| 26 legacy tests in `tests/` | Pending — migrate to co-location per module; drop `tests/` from `jest roots` when empty. |
