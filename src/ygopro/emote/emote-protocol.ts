/**
 * Emote wire protocol (server side) — the custom CTOS/STOC 0xfc opcode, in the
 * same family as PING/PONG and RECONNECT. The client sends CTOS 0xfc with an
 * emote id; the server bounds its size + rate-limits, then broadcasts STOC 0xfc
 * carrying the sender's seat so every viewer maps it to the right HUD side.
 *
 * The server keeps no emote catalog. Ids are either default emotes or emote
 * pack refs ("<pack-slug>/<emote-key>"), and only the receiving client can tell
 * which ones the sender may use, so it plays known ids and drops the rest.
 *
 * Frame layout (ygopro framing: [size:u16 LE][opcode:u8][body...], size counts
 * the opcode but not the 2-byte prefix):
 *   CTOS: body = [emoteId: utf-8]
 *   STOC: body = [playerType: u8][emoteId: utf-8]
 */

export const EMOTE_OPCODE = 0xfc;

/** Cooldown between accepted emotes, per client. */
export const EMOTE_COOLDOWN_MS = 2500;

/**
 * Longest id body, in bytes, the server relays. Every accepted frame is
 * broadcast to the whole room, so this bounds what one client can fan out.
 */
export const MAX_ID_BYTES = 48;

/**
 * Build the STOC emote frame broadcast to the room. A Buffer id is relayed
 * byte for byte, so the frame never grows past what the sender sent.
 */
export function buildStocEmoteFrame(playerType: number, emoteId: string | Buffer): Buffer {
	const idBytes = Buffer.isBuffer(emoteId) ? emoteId : Buffer.from(emoteId, "utf8");
	const size = 1 /* opcode */ + 1 /* playerType */ + idBytes.length;
	const frame = Buffer.alloc(2 + size);
	frame.writeUInt16LE(size, 0);
	frame.writeUInt8(EMOTE_OPCODE, 2);
	frame.writeUInt8(playerType & 0xff, 3);
	idBytes.copy(frame, 4);
	return frame;
}
