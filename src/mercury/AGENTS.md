# Mercury/Koishi Module Guidelines

## Context

This module handles the WebSocket-based protocol for web clients (like Koishi/Omega/Web). It translates YGOPro binary concepts into JSON/Protobuf for web consumption.

## Key Responsibilities

- **Protocol**: WebSocket (JSON/BSON/Protobuf) for modern web clients.
- **Room**: `MercuryRoom` logic adapted for web constraints (reconnection, spectators).
- **Interoperability**: Ensuring compatibility with EDOPro rooms where possible.

## Module-Specific Rules

### 1. WebSocket Handling

- Use `ws` library wrappers.
- **Payload Structure**: Expect JSON objects with `{ type: string, payload: any }`.
- **Validation**: Use `Zod` or manual validation on incoming JSON payloads.

### 2. Room Adaptation (`src/mercury/room/`)

- While similar to EDOPro, Mercury rooms handle spectating differently.
- **State Serialization**: More complex state serialization (sending full game state on reconnect).

### 3. Message Emitting

- Use `MercuryRoomMessageEmitter`.
- **JSON Format**: Ensure outgoing messages are clean JSON objects, not raw buffers.

## Common Tasks (SOPs)

### [SOP-MER-001] Adding a New Web Event

1.  **Define Type**: Add the event type string to the constants.
2.  **Handler**: Create a handler in `src/mercury/messages/`.
3.  **Process**:
    - Validate `payload`.
    - Call the relevant `Application` service.
    - Emit response via `ws.send(JSON.stringify({...}))`.

### [SOP-MER-002] Bridging EDOPro Logic

1.  **Shared Logic**: Whenever possible, reuse `shared/` logic.
2.  **Specific Adapters**: If logic diverges (e.g., custom web-only duel modes), implement adapters in `mercury/` rather than modifying `shared/`.
