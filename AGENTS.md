# AGENTS.md - Evolution Server Development Guide

## How to Use This Guide

- **Start here**: This file defines the rules, patterns, and workflows for the `EDOpro-server-ts` project.
- **Strict Adherence**: You must follow the "Prime Directives" and "Auto-invoke Skills" without exception.
- **Context**: This is a high-performance Hexagonal/DDD architecture.

## Project Overview

| Component       | Location                                | Tech Stack       | Description                                      |
| --------------- | --------------------------------------- | ---------------- | ------------------------------------------------ |
| **Core Domain** | `src/edopro/`, `src/shared/`            | TypeScript, DDD  | Business logic, Entities, Value Objects          |
| **API**         | `src/http-server/`                      | Express, Diod    | REST endpoints for management                    |
| **Realtime**    | `src/socket-server/`                    | WS, Net          | WebSocket & TCP socket handling                  |
| **Persistence** | `src/shared/infrastructure/persistence` | TypeORM, Redis   | PostgreSQL (Users), SQLite (Game), Redis (Cache) |
| **Clients**     | `src/edopro/`, `src/mercury/`           | Custom Protocols | Implementations for EDOPro and Koishi clients    |

---

## Prime Directives (Rules)

As an AI agent, you must strictly adhere to these rules. **Violation of these rules will result in rejected code.**

### 1. Architecture & Patterns

- **DDD is Mandatory**: Business logic lives in `domain/`. Never import `infrastructure/` or `application/`. Dependencies point inward.
- **Hexagonal Architecture**: Dependencies point inward. The core doesn't know about the database or sockets.
- **Mother Pattern**: ALWAYS use `*Mother` classes (Object Factories) for test data. Never manually instantiate complex entities in tests.
- **Chain of Responsibility**: Use this pattern for complex validations (e.g., Deck Rules).
- **Dependency Injection**: Use `diod` or constructor injection to manage dependencies.

### 2. Coding Standards

- **Explicit Visibility**: `public`, `private`, `protected` must be explicit.
- **No Console Logs**: Use `Logger` domain service.
- **Naming**: `PascalCase` for classes, `camelCase` for vars, `UPPER_SNAKE_CASE` for constants.
- **Conventional Commits**: Commit messages must follow the [Conventional Commits](https://www.conventionalcommits.org/) specification (e.g., `feat: add user login`, `fix: resolve room crash`).
- **Path Aliases**: Always use `@edopro/*` for imports from `src/edopro/` when possible.

### 3. Operational Safety

- **Absolute Paths**: Always use absolute paths for file operations.
- **Database**: Never alter `migrations/` manually after they are applied. Use `npm run migration:generate` for schema changes.
- **Verify**: Run `npm run lint` and `npm run test` before finishing.

---

## Available Skills

Use these skills for detailed patterns on-demand:

| Skill                  | Description                                                                                 | Location                                       |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `typescript-expert`    | Deep knowledge of type-level programming, performance, and tooling                          | `.agents/skills/typescript-expert/SKILL.md`    |
| `systematic-debugging` | Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes | `.agents/skills/systematic-debugging/SKILL.md` |

## Auto-invoke Skills

When performing these actions, **ALWAYS** follow the corresponding Standard Operating Procedure (SOP) below:

| Action                                              | Skill / SOP                                     |
| --------------------------------------------------- | ----------------------------------------------- |
| "Implement feature...", "Create use case..."        | **[SOP-001] Feature Implementation (DDD)**      |
| "Write tests...", "Fix bug...", "Add unit test"     | **[SOP-002] Testing Strategy (Mother Pattern)** |
| "Add field to DB", "Update schema", "New entity"    | **[SOP-003] Database Migration**                |
| "Create new module", "New architecture component"   | **[SOP-004] Module Creation**                   |
| "Fix complex type error", "Optimize TS build"       | **typescript-expert**                           |
| "Debug an issue", "Fix bug", "Why is this failing?" | **systematic-debugging**                        |

---

## Standard Operating Procedures (Skills)

### [SOP-001] Feature Implementation (DDD)

**Goal**: Implement a new feature following strict DDD/Hexagonal patterns.

1.  **Domain Layer** (`src/[module]/domain/`):
    - Define the Entity/Aggregate Root.
    - Define Value Objects if needed.
    - Define the `Repository` interface (port).
    - _Output_: `.ts` files with pure business logic.
2.  **Application Layer** (`src/[module]/application/`):
    - Create the Use Case (Service/Handler).
    - Inject the Repository interface via constructor.
    - _Output_: Service class implementing specific business action.
3.  **Infrastructure Layer** (`src/[module]/infrastructure/`):
    - Implement the Repository using TypeORM.
    - _Output_: Repository implementation file.
4.  **Interface Layer**:
    - Expose via Controller (HTTP) or Event Handler (Socket).

### [SOP-002] Testing Strategy (Mother Pattern)

**Goal**: Ensure robust testing using consistent data factories.

1.  **Locate/Create Mother**:
    - Check `tests/modules/[module]/domain/[Entity]Mother.ts`.
    - If missing, create it using `@faker-js/faker`.
    - _Template_:
      ```typescript
      export class UserMother {
        static create(overrides?: Partial<UserPrimitives>): User {
          const primitives = {
            id: UuidMother.create(),
            name: faker.person.firstName(),
            ...overrides,
          };
          return User.fromPrimitives(primitives);
        }
      }
      ```
2.  **Write Test Spec**:
    - Create `[UseCase].test.ts` in `tests/modules/[module]/application/`.
    - **Rule**: Describe the test case in **Spanish**.
    - _Template_:
      ```typescript
      describe("CrearSala", () => {
        it("debe permitir crear una sala pública correctamente", async () => {
          const user = UserMother.create();
          // ...
        });
      });
      ```

### [SOP-003] Database Migration

**Goal**: Safely modify the database schema.

1.  **Update Entity**: Modify the TypeORM entity class in `src/evolution-types/src/`.
2.  **Generate Migration**:
    ```bash
    npm run migration:generate --name=NameOfChange
    ```
3.  **Verify**: Inspect the generated file in `src/shared/infrastructure/persistence/typeorm/migrations/`.
4.  **Apply**:
    ```bash
    npm run migration:run
    ```

### [SOP-004] Module Creation

**Goal**: Create a new domain module from scratch.

1.  **Structure**:
    ```bash
    mkdir -p src/new-module/{domain,application,infrastructure}
    mkdir -p tests/modules/new-module
    ```
2.  **Registration**:
    - Register new entities in TypeORM config.
    - Register new controllers/handlers in the dependency injection container (`diod`).

---

## Technical Reference

### Key Commands

| Command                    | Description                          |
| -------------------------- | ------------------------------------ |
| `npm run dev`              | Start development server (Port 9229) |
| `npm run build`            | Build for production                 |
| `npm run test`             | Run all tests                        |
| `npm test -- path/to/file` | Run specific test file               |
| `npm run lint`             | Check code style                     |
| `npm run lint:fix`         | Fix code style                       |

### Path Aliases

- `@edopro/*` → `src/edopro/*`
- `@shared/*` → `src/shared/*`
- `@http/*` → `src/http-server/*`

### Multi-Client Architecture

The server acts as a bridge between different client protocols and the C++ Duel Engine:

- **EDOPro**: Binary TCP protocol.
- **Mercury**: WebSocket (JSON/Protobuf).
- **YGO Mobile**: Custom TCP.
- **Engine**: C++ child process interaction.

Ensure changes in `shared/` do not break protocol-specific implementations in `edopro/` or `mercury/`.
