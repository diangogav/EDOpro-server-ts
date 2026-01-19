# AGENTS.md - Evolution Server Development Guide

## Development Commands

### Core Development

- `npm run dev` - Start development server with hot-reload and debugging on port 9229
- `npm run build` - Compile TypeScript to JavaScript in `dist/` directory
- `npm run start` - Build and run production server

### Testing

- `npm run test` - Run all Jest tests
- `npm run test:watch` - Run tests in watch mode
- **Single test**: `npm test -- --testNamePattern="test name"` or `npm test -- path/to/test.test.ts`

### Code Quality

- `npm run lint` - Run ESLint on all files
- `npm run lint:fix` - Auto-fix linting issues
- Pre-commit hooks automatically run linting on staged files

### Database Operations

- `npm run migration:generate --name=migration_name` - Generate new TypeORM migration
- `npm run migration:run` - Run pending migrations
- `npm run migration:revert` - Revert last migration

## Project Architecture

Domain-Driven Design structure:

```
src/
├── edopro/           # EDOPro client implementation
│   └── room/
│       ├── domain/       # Core business logic
│       ├── application/  # Use cases and handlers
│       └── infrastructure/ # External dependencies
├── mercury/          # Koishi client implementation
├── shared/           # Common utilities and domain logic
├── http-server/      # REST API endpoints
└── socket-server/    # WebSocket and TCP socket handling
```

Path aliases: `@edopro/*` maps to `src/edopro/*`

## Code Style Guidelines

### TypeScript Configuration

- Target: ES2022 with CommonJS modules
- Decorators enabled (for TypeORM entities)
- Strict null checks enabled, but overall strict mode disabled
- Source maps enabled for debugging

### Import Organization

```typescript
// External libraries first
import { EventEmitter } from "stream";
import shuffle from "shuffle-array";

// Internal imports with relative paths
import { Logger } from "../../../shared/logger/domain/Logger";
import { Client } from "../../client/domain/Client";

// Use @edopro/* alias when available
import { Room } from "@edopro/room/domain/Room";
```

### Class and Interface Patterns

```typescript
// Constructor injection pattern
export class Room {
  constructor({
    socket,
    host,
    name,
    position,
  }: {
    socket: ISocket;
    host: boolean;
    name: string;
    position: number;
  }) {}

  public readonly name: string;
  private readonly _replay: Replay;
}

// Enum definitions
export enum Rule {
  ONLY_OCG,
  ONLY_TCG,
  OCG_TCG,
  PRE_RELEASE,
  ALL,
}
```

### Error Handling Pattern

Use chain of responsibility for validation:

```typescript
const handleValidations = new DeckLimitsValidationHandler(this.deckRules);
handleValidations
  .setNextHandler(new ForbiddenCardValidationHandler(this.banList))
  .setNextHandler(new SemiLimitedCardValidationHandler(this.banList))
  .setNextHandler(new LimitedCardValidationHandler(this.banList));
```

### Testing Patterns (Mother Pattern)

Use test data factories for consistent test data:

```typescript
export class RoomMother {
  static create(params?: Partial<RoomAttr>): Room {
    return Room.create({
      id: params?.id ?? faker.number.int({ min: 1, max: 9999 }),
      name: params?.name ?? faker.lorem.words(2),
      // ... other properties with faker defaults
    });
  }
}

// Test structure
describe("Room", () => {
  let room: Room;
  beforeEach(() => {
    room = RoomMother.create();
  });
  it("should handle scenario", () => {
    /* test implementation */
  });
});
```

## Linting Rules

### Permissive Style Approach

- No explicit return types required
- `any` type allowed
- No unused variables warnings
- Most TypeScript strictness rules disabled

### Important Rules Enforced

- `no-console`: allowed
- `no-debugger`: error
- `prefer-const`: error
- `no-var`: error
- Import resolution with TypeScript paths

## Environment Setup

### Requirements

- Node.js >= 24.11.0
- PostgreSQL for user data
- SQLite for game data
- Redis (optional, for legacy features)

### Configuration

- Environment variables in `.env` (use `.env.example` as template)
- Centralized config in `src/config/index.ts`
- TypeScript path aliases configured in both `tsconfig.json` and Jest

### Database

- TypeORM entities in `src/evolution-types/src/`
- Separate databases: SQLite for card/game data, PostgreSQL for user profiles

## Development Workflow

### Adding New Features

1. Follow DDD structure: domain → application → infrastructure
2. Create corresponding tests in `tests/modules/`
3. Use Mother pattern for test data
4. Run linting and tests before committing

### Testing Guidelines

- Tests located in `tests/modules/` mirroring `src/` structure
- Use descriptive test names in Spanish (matching existing tests)
- Mock external dependencies (Logger, Socket, etc.)
- Use beforeEach for clean test setup

## Key Dependencies

### Core

- Express.js for HTTP API
- WebSocket (ws) for real-time communication
- TypeORM with PostgreSQL/SQLite
- Redis for caching
- Diod for dependency injection

### Development

- TypeScript with modern ESLint flat config
- Jest for testing with ts-jest preset
- Husky for git hooks
- Pino/Winston for logging

## Special Considerations

### Multi-Client Architecture

The server handles multiple Yu-Gi-Oh! client types:

- EDOPro (Windows/Linux)
- Mercury/Koishi (Web-based)
- YGO Mobile

### Game Engine Integration

- C++ duel engine via child processes
- Custom message protocols for each client type
- State management for game rooms and duels

### Performance

- Lock-free concurrent operations where possible
- Async/await patterns throughout
- Event-driven architecture with EventEmitter

When working on this codebase, prioritize type safety where it adds value, maintain clean architecture boundaries, and ensure all changes include appropriate tests.
