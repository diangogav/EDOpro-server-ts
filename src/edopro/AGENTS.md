# EDOPro Module Guidelines

## Context

This module implements the server-side logic for the EDOPro client (Windows/Linux/Android/iOS). It handles raw TCP socket connections and binary data streams.

## Key Responsibilities

- **Protocol**: Managing the binary protocol used by YGOPro/EDOPro clients.
- **Room**: The `Room` aggregate here is specific to the EDOPro experience (Master Rules, Speed Duel, Rush Duel).
- **Duel**: Interfacing with the C++ `ocgcore` via child processes.

## Module-Specific Rules

### 1. Binary Protocol Handling

- **SmartBuffer**: Use `smart-buffer` for reading/writing packet data.
- **Packet Structure**:
  - Header: 2 bytes (length).
  - Payload: Variable length buffer.
- **Strict Typing**: When parsing packets, validate types immediately. Do not trust client input.

### 2. Room Management (`src/edopro/room/`)

- The `Room` class is the Aggregate Root.
- **Concurrency**: Operations on `Room` must be atomic where possible to prevent state corruption during a duel.
- **Locking**: Use `AsyncLock` if modifying game state that affects multiple players simultaneously.

### 3. Message Emitting

- Use `RoomMessageEmitter` to send updates to clients.
- **Broadcasting**: Use `broadcast()` for room-wide updates.
- **Targeting**: Use `sendTo()` for specific player messages (e.g. private hand info).

## Common Tasks (SOPs)

### [SOP-EDO-001] Adding a New Packet Handler

1.  **Identify OpCode**: Check `src/edopro/messages/MessageProcessor.ts` or `PacketType` enum.
2.  **Create Handler**: Implement the logic in the appropriate `Application` service.
3.  **Deserialize**: Read data from `SmartBuffer` in the controller/processor.
4.  **Execute**: Call the domain service.

### [SOP-EDO-002] Modifying Room Logic

1.  **Domain First**: Modify `Room.ts` entity methods.
2.  **Events**: If state changes, emit a domain event (e.g., `RoomPlayerJoined`).
3.  **Persistence**: Ensure `RoomRepository` saves the new state if it's persistent (most rooms are in-memory only).
