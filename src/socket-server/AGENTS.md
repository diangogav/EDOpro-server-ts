# Socket Server Guidelines

## Context

This module handles the low-level socket connections and server initialization for both EDOPro (TCP) and Mercury (WebSocket).

## Key Responsibilities

- **Connection Handling**: `net.Server` (TCP), `ws.Server` (WebSocket).
- **Initialization**: Port binding, `app` bootstrapping.
- **Buffers**: Low-level buffer management.

## Module-Specific Rules

### 1. Connection Management (`src/socket-server/`)

- **EDOPro**: Use `net.createServer()` for EDOPro clients.
- **Mercury**: Use `new WebSocket.Server()` for Mercury clients.
- **Lifecycle**: Handle `connection`, `data`, `close`, `error` events robustly.

### 2. Dependency Injection

- Inject the `Server` instance into the appropriate `Application` services.
- Ensure proper teardown/shutdown logic.

## Common Tasks (SOPs)

### [SOP-SOCK-001] Modifying Connection Handling

1.  **Modify Event Listener**: Update `on('data')` or `on('connection')` in `HostServer.ts` or `MercuryServer.ts`.
2.  **Buffers**: Ensure buffer parsing logic is correct for the protocol.
