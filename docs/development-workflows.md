# Development workflows

Step-by-step procedures for common changes. For tests, see [testing conventions](./testing.md).

## Feature implementation

Implement a new feature following DDD/Hexagonal patterns, from the inside out.

1. **Domain layer** (`src/[module]/domain/`): define the Entity/Aggregate Root, Value Objects if needed, and the `Repository` interface (port). Pure business logic only.
2. **Application layer** (`src/[module]/application/`): create the Use Case (Service/Handler) and inject the `Repository` interface through the constructor.
3. **Infrastructure layer** (`src/[module]/infrastructure/`): implement the `Repository` using TypeORM.
4. **Interface layer**: expose it through a Controller (HTTP) or Event Handler (Socket).

## Database migration

Safely modify the database schema.

1. **Update the entity**: modify the TypeORM entity class in `src/evolution-types/src/`.
2. **Generate the migration**:

   ```bash
   MIGRATION_NAME=NameOfChange pnpm migration:generate
   ```

3. **Verify**: inspect the generated file in `src/evolution-types/src/migrations/`.
4. **Apply**:

   ```bash
   pnpm migration:run
   ```

Never edit a migration manually after it is applied.

## Module creation

Create a new domain module from scratch.

1. **Structure**:

   ```bash
   mkdir -p src/new-module/{domain,application,infrastructure}
   ```

   Tests are co-located next to their source inside these folders, with no separate `tests/` tree.

2. **Registration**: register new entities in the TypeORM config, and new controllers/handlers in the dependency injection container (`diod`).
