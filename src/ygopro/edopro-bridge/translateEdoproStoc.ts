import {
	YGOProStoc,
	YGOProStocErrorMsg,
	YGOProStocGameMsg,
	YGOProStocJoinGame,
} from "ygopro-msg-encode";
import { decodeEdoproHostInfo, type EdoproHostInfo } from "./edopro-lobby";
import { translateIgnisGameMsg, type IgnisTranslationContext } from "./translateIgnisGameMsg";

const STOC_GAME_MSG = 0x01;
const STOC_ERROR_MSG = 0x02;
const STOC_CREATE_GAME = 0x11;
const STOC_JOIN_GAME = 0x12;

/**
 * STOC frames both protocols lay out the same way, so the YGOPro decoder
 * reads them as they are: select hand/tp, hand result, change side, waiting
 * side, type change, duel start/end, time limit, player enter/change, watch
 * change.
 */
const SHARED_LAYOUT: ReadonlySet<number> = new Set([
	0x03, 0x04, 0x05, 0x07, 0x08, 0x13, 0x15, 0x16, 0x18, 0x20, 0x21, 0x22,
]);

export type EdoproStocTranslation =
	| { readonly kind: "stoc"; readonly message: unknown }
	| { readonly kind: "room-created"; readonly roomId: number }
	| { readonly kind: "joined"; readonly message: YGOProStocJoinGame; readonly room: EdoproHostInfo }
	/** A core message the client derives from others; safe to drop. */
	| { readonly kind: "ignored" }
	| { readonly kind: "unsupported"; readonly command: number; readonly messageType?: number };

/**
 * Translate one EDOPro STOC frame (`[length:u16][command:u8][body]`) into the
 * message object the YGOPro protocol services already route.
 */
export function translateEdoproStoc(
	frameBytes: Uint8Array,
	context: IgnisTranslationContext,
): EdoproStocTranslation {
	const command = frameBytes[2];
	if (command === undefined) return { kind: "unsupported", command: -1 };
	const body = frameBytes.subarray(3);

	if (command === STOC_GAME_MSG) {
		const translated = translateIgnisGameMsg(body, context);
		if (translated.kind === "ignored") return { kind: "ignored" };
		if (translated.kind === "unsupported") {
			return { kind: "unsupported", command, messageType: translated.messageType };
		}
		const stoc = new YGOProStocGameMsg();
		stoc.msg = translated.message;
		return { kind: "stoc", message: stoc };
	}

	if (command === STOC_ERROR_MSG) return { kind: "stoc", message: decodeError(body) };

	if (command === STOC_CREATE_GAME) {
		const roomId = new DataView(body.buffer, body.byteOffset, body.byteLength).getUint32(0, true);
		return { kind: "room-created", roomId };
	}

	if (command === STOC_JOIN_GAME) {
		const room = decodeEdoproHostInfo(body);
		const message = new YGOProStocJoinGame();
		message.info = room.hostInfo;
		return { kind: "joined", message, room };
	}

	if (SHARED_LAYOUT.has(command)) {
		const message = YGOProStoc.getInstanceFromPayload(frameBytes);
		if (message !== undefined) return { kind: "stoc", message };
	}

	return { kind: "unsupported", command };
}

const DECK_ERROR_BODY_BYTES = 24;
const COMPACT_ERROR_BODY_BYTES = 5;
const DECK_ERROR_MAIN_COUNT = 6;
const DECK_ERROR_SIDE_COUNT = 8;

/**
 * An EDOPro room reports errors in three shapes: a compact `[type][code:u32]`,
 * the padded `[type][pad:3][code:u32]` YGOPro also uses, and a deck error that
 * spells out `[kind][got][min][max][card code]` as separate 32-bit fields.
 * YGOPro packs a deck error as `kind << 28 | detail`, where the detail is the
 * card code, or the card count for a size error.
 */
function decodeError(body: Uint8Array): YGOProStocErrorMsg {
	const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
	const message = new YGOProStocErrorMsg();
	message.msg = view.getUint8(0);

	if (body.length >= DECK_ERROR_BODY_BYTES) {
		const kind = view.getUint32(4, true);
		const isSizeError = kind >= DECK_ERROR_MAIN_COUNT && kind <= DECK_ERROR_SIDE_COUNT;
		const detail = isSizeError ? view.getUint32(8, true) : view.getUint32(20, true);
		message.code = (((kind & 0xf) << 28) | (detail & 0x0fff_ffff)) >>> 0;
	} else if (body.length === COMPACT_ERROR_BODY_BYTES) {
		message.code = view.getUint32(1, true);
	} else {
		message.code = view.getUint32(4, true);
	}
	return message;
}
