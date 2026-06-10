/**
 * STOC_EVRP_EXPORT — proprietary opcode for the .evrp replay format.
 *
 * Existing STOC ids occupy 0x01..0x31 (1..49).
 * 0x17 = STOC_REPLAY (.yrp path — DO NOT reuse).
 * 0x31 = srvpro roomlist.
 * 0xF0 is safely above any current or plausible upstream allocation.
 *
 * This file is the canonical definition (server PR1).
 * Client mirror: evolution-card-game/src/protocol/replay/evrp-constants.ts
 */

/** STOC opcode byte for EVRP export frames. */
export const STOC_EVRP_EXPORT = 0xf0;

/** Envelope version embedded in every chunk header. */
export const EVRP_VERSION = 1;

/**
 * Maximum data payload per STOC_EVRP_EXPORT frame (48 KiB).
 *
 * Wire frame layout (server → client):
 *   [lenLo:u8][lenHi:u8][0xF0:u8][version:u8][indexLo:u8][indexHi:u8][countLo:u8][countHi:u8][chunk≤49152]
 *
 * Total frame ≤ 2 + 1 + 1 + 2 + 2 + 49152 = 49160 bytes — well under the
 * 65535-byte 2-byte-LE-prefix ceiling.
 */
export const EVRP_CHUNK_BYTES = 49152;
