import {
	ChatColor,
	YGOProMsgResponseBase,
	YGOProStocChat,
	YGOProStocErrorMsg,
	YGOProStocGameMsg,
	YGOProStocJoinGame,
} from "ygopro-msg-encode";

import { closedZonesFromFlags } from "./edopro-lobby";
import { translateEdoproStoc } from "./translateEdoproStoc";
import { translateResponseToIgnis } from "./translateResponseToIgnis";

const DEFAULT_DUEL_RULE = 5;
const COMMAND_OFFSET = 2;
const BODY_OFFSET = 3;

const CTOS_RESPONSE = 0x01;
const STOC_GAME_MSG = 0x01;
const MSG_START = 4;
const MSG_FIELD_DISABLED = 56;
const STOC_CHAT = 0x19;
const STOC_CHAT_2 = 0xf3;
/** Shared-kernel frames both wire formats carry: reconnection token, emote, pong. */
const SHARED_KERNEL_COMMANDS: ReadonlySet<number> = new Set([STOC_CHAT, 0xfc, 0xfd, 0xfe]);

const CHAT_2_SERVER_ERROR = 0x04;
const CHAT_2_NAME_BYTES = 40;
/** STOC_CHAT sender a YGOPro client shows without a name of its own; the text carries it. */
const NAMELESS_SENDER = 7;

/**
 * Core game messages laid out the same in both cores, so the frame goes out
 * as it came: the ones with no body (retry, waiting, summoned, special and
 * flip summoned, chain end, attack disabled, damage step start and end,
 * reverse deck) and the ones whose fields have the same widths (win, new
 * turn, new phase, select place, position and disable field, position change, field
 * disabled, the one-byte chain steps, shuffle deck, the life point changes,
 * counters, coin, dice and announce attribute).
 */
const SAME_LAYOUT_MESSAGES: ReadonlySet<number> = new Set([
	1, 3, 37, 61, 63, 65, 74, 112, 113, 114, 5, 18, 19, 24, 32, 40, 41, 53, 56, 71, 72, 73, 75, 76,
	91, 92, 94, 100, 101, 102, 130, 131, 141,
]);

export type UntranslatedListener = (messageType: number) => void;

/**
 * Speaks YGOPro to a client seated in an EDOPro room. The room keeps sending
 * and reading its own wire format; this rewrites each frame on the way out
 * and each response on the way in. One instance per socket: it remembers the
 * prompt the core is waiting on and the room's Master Rule.
 */
export class EdoproWireTranslator {
	private prompt: YGOProMsgResponseBase | null = null;
	/** Zones the room's field never opens, as a MSG_FIELD_DISABLED mask. */
	private closedZones = 0;

	/**
	 * `duelRule` is the room's Master Rule when it is already known, as on a
	 * reconnection, where the room sends no host info to learn it from.
	 * `ownBanListHash` gives the hash the client knows the room's ban list by,
	 * or null to leave the room's own hash in place.
	 */
	constructor(
		private readonly onUntranslated: UntranslatedListener = () => undefined,
		private duelRule = DEFAULT_DUEL_RULE,
		private readonly ownBanListHash: (edoproHash: number) => number | null = () => null,
	) {}

	/**
	 * The YGOPro frames for one EDOPro frame from the room. Most frames give
	 * one or none; the start of a duel on a field with closed columns gives a
	 * second one that closes them, because the core tells the client nothing
	 * about them.
	 */
	public toClientFrames(frame: Buffer): Buffer[] {
		const translated = this.toClient(frame);
		if (!translated) {
			return [];
		}
		const startsDuel = frame[COMMAND_OFFSET] === STOC_GAME_MSG && frame[BODY_OFFSET] === MSG_START;

		return startsDuel && this.closedZones !== 0
			? [translated, EdoproWireTranslator.fieldDisabled(this.closedZones)]
			: [translated];
	}

	/** The YGOPro frame for one EDOPro frame from the room, or null when the client gets nothing. */
	public toClient(frame: Buffer): Buffer | null {
		const command = frame[COMMAND_OFFSET];

		if (SHARED_KERNEL_COMMANDS.has(command)) {
			return frame;
		}
		if (command === STOC_CHAT_2) {
			return EdoproWireTranslator.chat(frame);
		}
		if (command === STOC_GAME_MSG && SAME_LAYOUT_MESSAGES.has(frame[BODY_OFFSET])) {
			// A prompt answered the same way in both cores needs no rewriting either.
			this.prompt = null;

			return frame;
		}

		const result = translateEdoproStoc(frame, { duelRule: this.duelRule });
		switch (result.kind) {
			case "joined": {
				this.duelRule = result.room.hostInfo.duel_rule;
				this.closedZones = closedZonesFromFlags(result.room.duelFlagsLow);
				const own = this.ownBanListHash(result.room.hostInfo.lflist);
				if (own !== null) {
					result.room.hostInfo.lflist = own;
				}

				return EdoproWireTranslator.encode(result.message);
			}
			case "stoc":
				return this.encodeStoc(result.message, frame);
			case "unsupported":
				if (result.messageType !== undefined) {
					this.onUntranslated(result.messageType);
				}

				return null;
			default:
				return null;
		}
	}

	/** The frame the room expects for one YGOPro frame from the client. */
	public toRoom(frame: Buffer): Buffer {
		if (frame[COMMAND_OFFSET] !== CTOS_RESPONSE) {
			return frame;
		}
		const response = translateResponseToIgnis(this.prompt, frame.subarray(BODY_OFFSET));
		const header = Buffer.alloc(BODY_OFFSET);
		header.writeUInt16LE(response.length + 1, 0);
		header[COMMAND_OFFSET] = CTOS_RESPONSE;

		return Buffer.concat([header, response]);
	}

	private encodeStoc(message: unknown, original: Buffer): Buffer {
		if (message instanceof YGOProStocGameMsg) {
			if (message.msg instanceof YGOProMsgResponseBase) {
				this.prompt = message.msg;
			}

			return EdoproWireTranslator.encode(message);
		}
		if (message instanceof YGOProStocErrorMsg || message instanceof YGOProStocJoinGame) {
			return EdoproWireTranslator.encode(message);
		}

		// Decoded only to confirm the layout is shared: the bytes already are YGOPro's.
		return original;
	}

	private static fieldDisabled(zones: number): Buffer {
		const frame = Buffer.alloc(BODY_OFFSET + 5);
		frame.writeUInt16LE(frame.length - 2, 0);
		frame[COMMAND_OFFSET] = STOC_GAME_MSG;
		frame[BODY_OFFSET] = MSG_FIELD_DISABLED;
		frame.writeUInt32LE(zones, BODY_OFFSET + 1);

		return frame;
	}

	private static encode(message: { toFullPayload(): Uint8Array }): Buffer {
		return Buffer.from(message.toFullPayload());
	}

	/**
	 * EDOPro's chat frame names the sender; YGOPro's names a seat. The line
	 * goes out with the name in the text, the way spectator chat already does.
	 */
	private static chat(frame: Buffer): Buffer {
		const kind = frame[BODY_OFFSET];
		const textOffset = BODY_OFFSET + 2 + CHAT_2_NAME_BYTES;
		const read = (bytes: Buffer): string => bytes.toString("utf16le").split("\0", 1)[0];
		const text = read(frame.subarray(textOffset));
		if (kind === CHAT_2_SERVER_ERROR) {
			return EdoproWireTranslator.encode(
				new YGOProStocChat().fromPartial({ player_type: ChatColor.RED, msg: text }),
			);
		}
		const name = read(frame.subarray(BODY_OFFSET + 2, textOffset));

		return EdoproWireTranslator.encode(
			new YGOProStocChat().fromPartial({ player_type: NAMELESS_SENDER, msg: `${name}: ${text}` }),
		);
	}
}
