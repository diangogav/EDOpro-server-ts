# Shared Kernel Guidelines

## Context

This is the **Core Domain** and **Common Infrastructure** layer. It contains entities, value objects, and shared logic used by all modules (EDOPro, Mercury, HTTP).

## Key Responsibilities

- **Domain Primitives**: `Entity`, `ValueObject`, `AggregateRoot`.
- **Infrastructure**: TypeORM connection (`db/`), Redis client.
- **Utilities**: `Logger`, `EventBus`, `RandomUtils`.
- **Rules**: NO CLIENT-SPECIFIC IMPORTS.

## Module-Specific Rules

### 1. Domain Entities (`src/shared/domain/`)

- Define strictly typed, behavior-rich entities.
- **Validation**: Validate invariants in the constructor or factory methods.

### 2. Infrastructure (`src/shared/infrastructure/`)

- **TypeORM**: Define repositories here.
- **Redis**: Implement caching or pub/sub here.
- **Dependency Inversion**: Implement `Repository` interfaces defined in domain layers.

### 3. Events (`src/shared/domain/events/`)

- Define shared `DomainEvent` classes.
- Use `EventBus` to publish events.

## Common Tasks (SOPs)

### [SOP-SHR-001] Adding a New Shared Entity

1.  **Define Primitive**: Create primitive type in `src/evolution-types/`.
2.  **Create Entity**: Implement class extending `AggregateRoot` or `Entity`.
3.  **Repository Interface**: Define `Repository` interface alongside the entity.

### [SOP-SHR-002] Modifying Database Schema

1.  **Modify Entity**: Add/Change field in TypeORM entity.
2.  **Generate Migration**: `npm run migration:generate`.
3.  **Run Migration**: `npm run migration:run`.
