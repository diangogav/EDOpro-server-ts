/**
 * Emote wire protocol (server side) — the custom CTOS/STOC 0xfc opcode, in the
 * same family as PING/PONG and RECONNECT. The client sends CTOS 0xfc with a
 * catalog id; the server validates + rate-limits, then broadcasts STOC 0xfc
 * carrying the sender's seat so every viewer maps it to the right HUD side.
 *
 * Frame layout (ygopro framing: [size:u16 LE][opcode:u8][body...], size counts
 * the opcode but not the 2-byte prefix):
 *   CTOS: body = [emoteId: utf-8]
 *   STOC: body = [playerType: u8][emoteId: utf-8]
 */

export const EMOTE_OPCODE = 0xfc;

/** Cooldown between accepted emotes, per client. */
export const EMOTE_COOLDOWN_MS = 2500;

/** Longest id the wire accepts — bounds a malformed/oversized frame. */
export const MAX_ID_LENGTH = 24;

/**
 * Ids the server accepts, mirroring the client emote catalog. An unknown id is
 * dropped (never broadcast), so a client cannot inject arbitrary strings.
 */
export const EMOTE_IDS: ReadonlySet<string> = new Set([
	"wave",
	"thumbsup",
	"fire",
	"thinking",
	"cool",
	"mindblown",
	"sweat",
	"cry",
]);

export function isValidEmoteId(id: string): boolean {
	return id.length > 0 && id.length <= MAX_ID_LENGTH && EMOTE_IDS.has(id);
}

/** Build the STOC emote frame broadcast to the room. */
export function buildStocEmoteFrame(playerType: number, emoteId: string): Buffer {
	const idBytes = Buffer.from(emoteId, "utf8");
	const size = 1 /* opcode */ + 1 /* playerType */ + idBytes.length;
	const frame = Buffer.alloc(2 + size);
	frame.writeUInt16LE(size, 0);
	frame.writeUInt8(EMOTE_OPCODE, 2);
	frame.writeUInt8(playerType & 0xff, 3);
	idBytes.copy(frame, 4);
	return frame;
}
