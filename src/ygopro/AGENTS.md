# YGOPro Module Guidelines

## Context

This module implements the srvpro2-compatible server for YGOPro clients (Koishi, YGO Mobile, YGOPro). It handles binary TCP connections using the YGOPro protocol. srvpro2 is the source of truth for protocol behavior.

## Key Responsibilities

- **Protocol**: Binary TCP protocol compatible with srvpro2.
- **Room**: `YGOProRoom` with format-based configuration (TCG, OCG, PRE, Edison, GOAT, etc.).
- **Duel**: ocgcore execution via worker threads using `yuzuthread` and `koishipro-core.js`.
- **Card Storage**: Dual card pool (standard + extended) loaded from `.cdb` files via `YGOProResourceLoader`.

## Module-Specific Rules

### 1. Binary Protocol Handling

- Use `ygopro-msg-encode` for message encoding/decoding.
- **Packet Structure**: Same as YGOPro/srvpro2 binary protocol.
- **Strict Typing**: Validate all client input. Do not trust client data.

### 2. Room Management (`src/ygopro/room/`)

- `YGOProRoom` is the central entity.
- **Format Commands**: Parsed via `RuleMappings.ts` (ruleMappings, formatRuleMappings, priorityRuleMappings).
- **Card Pool**: `useExtendedCardPool` flag determines standard vs extended card storage.
- **State Machine**: Room states (Waiting, RPS, ChoosingOrder, Dueling, SideDecking) via `YGOProRoomState`.

### 3. Card Database Architecture

- `YGOProResourceLoader` (singleton) loads two `CardStorage` instances at startup.
- **Standard pool** (`YGOPRO_FOLDERS`): Available to all rooms.
- **Extended pool** (`YGOPRO_FOLDERS` + `YGOPRO_EXTRA_FOLDERS`): Only for PRE/ART formats.
- `CardYGOProRepository` resolves the correct pool based on the room's `useExtendedCardPool` flag.
- Unknown cards return `UnknownCardError` — never silently ignored.

### 4. Deck Validation

- `MercuryDeckValidator` uses Chain of Responsibility pattern.
- `CardAvailabilityValidationHandler` uses srvpro2's bitwise scope check: `(cardOt & availFlag) === availFlag`.
- Rule values follow srvpro2 protocol (0=OCG, 1=TCG, 5=ALL), not the shared `Rule` enum.

### 5. Source of Truth

- **srvpro2** is the reference for protocol behavior and message handling.
- **Multirole** is the reference for the EDOPro module — do NOT mix their patterns.

## Common Tasks (SOPs)

### [SOP-YGO-001] Adding a New Room Format

1. Add the format to `formatRuleMappings` in `RuleMappings.ts` with correct `rule`, `duel_rule`, `lflist`, `time_limit`.
2. If it needs pre-release/art cards, add the format name to `extendedCardPoolFormats`.
3. Add a banlist `lflist.conf` to the corresponding `resources/ygopro/alternatives/<format>/` directory.
4. Add tests in `YGOProRoom.test.ts`.

### [SOP-YGO-002] Adding a New Message Handler

1. Identify the command code in `Commands.ts`.
2. Create the handler in the appropriate room state (`YGOProWaitingState`, `YGOProDuelingState`, etc.).
3. Compare behavior with srvpro2 source code.
