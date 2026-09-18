import { MatchmakingStatusState, RejectionReason } from "../domain/ParticipantChannel";
import { MatchmakingFormat, MatchmakingMode, OpponentType } from "../domain/QueueEntry";

/**
 * Matchmaking wire protocol — five dedicated CTOS/STOC opcodes in the same
 * family as PING/PONG, RECONNECT and EMOTE. Framing: [size:u16 LE][opcode:u8]
 * [body...], size counts the opcode but not the 2-byte prefix.
 */

export const MATCHMAKING_AUTH = 0xfb; // CTOS: [ticketLen:u8][ticket:utf-8]
export const MATCHMAKING_ENTER = 0xfa; // CTOS: [format:u8][mode:u8][clientVersion:u16 LE]
export const MATCHMAKING_CANCEL = 0xf9; // CTOS: empty
export const MATCHMAKING_STATUS = 0xf8; // STOC: [state:u8][waitedMs:u32 LE][reason:u8]
export const MATCHMAKING_FOUND = 0xf7; // STOC: [opponentType:u8][rated:u8][roomId:u16 LE][matchIdLen:u8][matchId][opponentNameLen:u8][opponentName]

/** Bounds a malformed/oversized ticket before it ever reaches Redis. */
export const MAX_TICKET_BYTES = 64;
/** Longer DB names are truncated on a code-point boundary before encoding. */
export const MAX_OPPONENT_NAME_BYTES = 32;

const ENTER_BODY_LENGTH = 4;

/** Wire-only reason value: encodes "no reason" on a non-rejected STATUS frame.
 * `RejectionReason` itself (owned by the domain) never carries this member —
 * absence of a reason is expressed by an optional field there instead. */
type WireReason = RejectionReason | "none";

export type ParseResult<T> = { ok: true; value: T } | { ok: false; reason: RejectionReason };

export interface CtosAuth {
	readonly ticket: string;
}

export interface CtosEnter {
	readonly format: MatchmakingFormat;
	readonly mode: MatchmakingMode;
	readonly clientVersion: number;
}

export interface MatchmakingFoundNotice {
	readonly opponentType: OpponentType;
	readonly rated: boolean;
	readonly roomId: number;
	readonly matchId: string;
	readonly opponentName: string | null;
}

/** Explicit code<->value tables (never array indexing, D4): a hostile byte must
 * not index out of a domain array, and reordering a list elsewhere must never
 * silently change what the wire means. */
const FORMAT_BY_CODE: Readonly<Partial<Record<number, MatchmakingFormat>>> = Object.freeze({
	0: "tcg",
	1: "jtp",
	2: "edison",
});
const MODE_BY_CODE: Readonly<Partial<Record<number, MatchmakingMode>>> = Object.freeze({
	0: "ranked",
});

const STATE_TO_CODE: Readonly<Record<MatchmakingStatusState, number>> = Object.freeze({
	searching: 0,
	cancelled: 1,
	rejected: 2,
	replaced: 3,
	authenticated: 4,
});

const REASON_TO_CODE: Readonly<Record<WireReason, number>> = Object.freeze({
	none: 0,
	invalid_ticket: 1,
	not_authenticated: 2,
	already_authenticated: 3,
	unknown_format: 4,
	unsupported_mode: 5,
	malformed_frame: 6,
	rate_limited: 7,
	replaced_by_new_connection: 8,
	missing_player_info: 9,
	banned: 10,
	internal_error: 11,
	cancel_too_late: 12,
	already_queued: 13,
	version_mismatch: 14,
});

const OPPONENT_TYPE_TO_CODE: Readonly<Record<OpponentType, number>> = Object.freeze({
	human: 0,
	bot: 1,
});

export function parseCtosAuth(body: Buffer): ParseResult<CtosAuth> {
	if (body.length < 1) {
		return { ok: false, reason: "malformed_frame" };
	}
	const ticketLen = body.readUInt8(0);
	if (ticketLen > MAX_TICKET_BYTES || body.length !== 1 + ticketLen) {
		return { ok: false, reason: "malformed_frame" };
	}

	return { ok: true, value: { ticket: body.subarray(1, 1 + ticketLen).toString("utf8") } };
}

export function parseCtosEnter(body: Buffer): ParseResult<CtosEnter> {
	if (body.length !== ENTER_BODY_LENGTH) {
		return { ok: false, reason: "malformed_frame" };
	}
	const format = FORMAT_BY_CODE[body.readUInt8(0)];
	if (format === undefined) {
		return { ok: false, reason: "unknown_format" };
	}
	const mode = MODE_BY_CODE[body.readUInt8(1)];
	if (mode === undefined) {
		return { ok: false, reason: "unsupported_mode" };
	}

	return { ok: true, value: { format, mode, clientVersion: body.readUInt16LE(2) } };
}

export function parseCtosCancel(body: Buffer): ParseResult<Record<string, never>> {
	if (body.length !== 0) {
		return { ok: false, reason: "malformed_frame" };
	}

	return { ok: true, value: {} };
}

export function buildStocMatchmakingStatusFrame(
	state: MatchmakingStatusState,
	waitedMs: number,
	reason: WireReason = "none",
): Buffer {
	const body = Buffer.alloc(6);
	body.writeUInt8(STATE_TO_CODE[state], 0);
	body.writeUInt32LE(waitedMs, 1);
	body.writeUInt8(REASON_TO_CODE[reason], 5);

	return buildFrame(MATCHMAKING_STATUS, body);
}

export function buildStocMatchmakingFoundFrame(notice: MatchmakingFoundNotice): Buffer {
	const matchIdBytes = Buffer.from(notice.matchId, "utf8");
	const nameBytes =
		notice.opponentName !== null
			? truncateUtf8(notice.opponentName, MAX_OPPONENT_NAME_BYTES)
			: Buffer.alloc(0);
	const body = Buffer.concat([
		Buffer.from([OPPONENT_TYPE_TO_CODE[notice.opponentType], notice.rated ? 1 : 0]),
		u16le(notice.roomId),
		Buffer.from([matchIdBytes.length]),
		matchIdBytes,
		Buffer.from([nameBytes.length]),
		nameBytes,
	]);

	return buildFrame(MATCHMAKING_FOUND, body);
}

function buildFrame(opcode: number, body: Buffer): Buffer {
	const size = 1 + body.length;
	const frame = Buffer.alloc(2 + size);
	frame.writeUInt16LE(size, 0);
	frame.writeUInt8(opcode, 2);
	body.copy(frame, 3);

	return frame;
}

function u16le(value: number): Buffer {
	const buffer = Buffer.alloc(2);
	buffer.writeUInt16LE(value, 0);

	return buffer;
}

/** Truncates UTF-8 bytes to at most `maxBytes`, never splitting a code point. */
function truncateUtf8(value: string, maxBytes: number): Buffer {
	const bytes = Buffer.from(value, "utf8");
	if (bytes.length <= maxBytes) {
		return bytes;
	}
	let end = maxBytes;
	while (end > 0 && (bytes[end] & 0xc0) === 0x80) {
		end -= 1;
	}

	return bytes.subarray(0, end);
}
