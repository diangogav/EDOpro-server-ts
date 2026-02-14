# HTTP Server Guidelines

## Context

This module exposes the REST API for management, matchmaking, room lists, and user profiles.

## Key Responsibilities

- **Controllers**: Handling HTTP requests (GET, POST, PUT, DELETE).
- **Dependency Injection**: Use `diod` for injecting services into controllers.
- **Middleware**: Authentication (JWT), logging, error handling.

## Module-Specific Rules

### 1. Controllers (`src/http-server/controllers/`)

- **Structure**: One controller per resource (e.g. `RoomController`, `UserController`).
- **Decorators**: Use `@Controller()` and `@Get()`/`@Post()` decorators if using a framework like `routing-controllers` (if applicable) or manual routing in `routes/`.
- **Response**: Standard JSON responses: `{ success: boolean, data?: any, error?: string }`.

### 2. Dependency Injection

- Always define dependencies in `src/di-container.ts` or similar setup.
- Inject services into constructor parameters.

### 3. Middleware

- **Auth**: Protect routes using `AuthMiddleware`.
- **Validation**: Validate body/params using `express-validator` or Zod.

## Common Tasks (SOPs)

### [SOP-API-001] Creating a New Endpoint

1.  **Define Route**: Add route definition in `src/http-server/routes/`.
2.  **Controller Method**: Implement the method in the relevant Controller class.
3.  **Service Call**: Delegate logic to `Application` services (never write business logic in controllers).
4.  **Response**: Return standard JSON format.

### [SOP-API-002] Adding Middleware

1.  **Create Middleware**: Write function in `src/http-server/middlewares/`.
2.  **Apply**: Use `app.use()` or route-specific application.
