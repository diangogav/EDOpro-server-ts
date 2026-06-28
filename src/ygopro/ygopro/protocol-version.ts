/**
 * YGOPRO_PROTOCOL_VERSION — the YGOPro network protocol version (PVERSION).
 *
 * Canonical single source of truth. Consumed by:
 *   - DuelRecord replay header (ygopro/room/domain/DuelRecord.ts)
 *   - WindBot join wiring (composition root, src/index.ts)
 *
 * Must match the protocol version the clients and WindBot binary speak.
 */
export const YGOPRO_PROTOCOL_VERSION = 0x1362;
