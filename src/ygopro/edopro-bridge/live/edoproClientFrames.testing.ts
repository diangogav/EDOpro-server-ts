/**
 * The frames an EDOPro desktop client sends to host or join a room. The
 * harnesses use them to play the EDOPro friend; the web client itself never
 * creates EDOPro rooms.
 */
import { duelRuleFromFlags } from "../edopro-lobby";

export const CTOS_CREATE_GAME = 0x11;
export const CTOS_JOIN_GAME = 0x12;

/** Value EDOPro clients and servers exchange to tell each other apart from YGOPro. */
const SERVER_HANDSHAKE = 4043399681;
/** EDOPro client 41.0 on core 11.0: [client major, client minor, core major, core minor]. */
const CLIENT_VERSION: readonly [number, number, number, number] = [41, 0, 11, 0];

const HOST_INFO_SIZE = 68;
const NAME_UNITS = 20;
const NOTES_SIZE = 200;

const DUEL_PZONE = 0x800;
const DUEL_EMZONE = 0x2000;
const DUEL_FSX_MMZONE = 0x4000;
const DUEL_TRAP_MONSTERS_NOT_USE_ZONE = 0x8000;
const DUEL_TRIGGER_ONLY_IN_LOCATION = 0x20000;
/**
 * Field and ruling flags of each Master Rule, as EDOPro's room creation sets
 * them. Only Master Rule 4 and 5 have Extra Monster Zones.
 */
export const DUEL_MODE_BY_MASTER_RULE: Readonly<Record<number, number>> = {
	1: 0xd0700,
	2: 0xd0600,
	3: 0xd1800,
	4: 0xd2800,
	5: 0x2e800,
};

export const DUEL_MODE_MR5 =
	DUEL_PZONE |
	DUEL_EMZONE |
	DUEL_FSX_MMZONE |
	DUEL_TRAP_MONSTERS_NOT_USE_ZONE |
	DUEL_TRIGGER_ONLY_IN_LOCATION;

export interface EdoproRoomOptions {
	readonly banlistHash: number;
	/** EDOPro card-pool scope: 0 OCG, 1 TCG, 2 OCG/TCG, 3 prerelease, 4 anything. */
	readonly rule: number;
	/** 0 single, 1 match, 2 tag. */
	readonly mode: number;
	readonly noCheckDeck: boolean;
	readonly noShuffleDeck: boolean;
	readonly startLp: number;
	readonly startHand: number;
	readonly drawCount: number;
	readonly timeLimit: number;
	readonly duelFlagsLow: number;
	readonly duelFlagsHigh: number;
	readonly bestOf: number;
	readonly name: string;
	readonly password: string;
}

/** Wrap a body as `[length:u16][command:u8][body]`, the framing both protocols share. */
export function frame(command: number, body: Uint8Array): Uint8Array {
	const out = new Uint8Array(3 + body.length);
	const view = new DataView(out.buffer);
	view.setUint16(0, body.length + 1, true);
	out[2] = command;
	out.set(body, 3);
	return out;
}

export function buildCtosCreateGame(options: EdoproRoomOptions): Uint8Array {
	const body = new Uint8Array(HOST_INFO_SIZE + NAME_UNITS * 2 * 2 + NOTES_SIZE);
	const view = new DataView(body.buffer);
	view.setUint32(0, options.banlistHash >>> 0, true);
	view.setUint8(4, options.rule);
	view.setUint8(5, options.mode);
	view.setUint8(6, duelRuleFromFlags(options.duelFlagsLow));
	view.setUint8(7, options.noCheckDeck ? 1 : 0);
	view.setUint8(8, options.noShuffleDeck ? 1 : 0);
	view.setUint32(12, options.startLp, true);
	view.setUint8(16, options.startHand);
	view.setUint8(17, options.drawCount);
	view.setUint16(18, options.timeLimit, true);
	view.setUint32(20, options.duelFlagsHigh >>> 0, true);
	view.setUint32(24, SERVER_HANDSHAKE, true);
	body.set(CLIENT_VERSION, 28);
	view.setInt32(32, 1, true);
	view.setInt32(36, 1, true);
	view.setInt32(40, options.bestOf, true);
	view.setUint32(44, options.duelFlagsLow >>> 0, true);
	view.setUint32(48, 0, true); // forbidden card types
	view.setUint16(52, 0, true); // extra rules
	writeDeckSizes(view, 54);
	writeUtf16(view, HOST_INFO_SIZE, options.name);
	writeUtf16(view, HOST_INFO_SIZE + NAME_UNITS * 2, options.password);
	return frame(CTOS_CREATE_GAME, body);
}

export function buildCtosJoinGame(roomId: number, password: string): Uint8Array {
	const body = new Uint8Array(52);
	const view = new DataView(body.buffer);
	view.setUint16(0, CLIENT_VERSION[0] | (CLIENT_VERSION[1] << 8), true);
	view.setUint32(4, roomId, true);
	writeUtf16(view, 8, password);
	body.set(CLIENT_VERSION, 48);
	return frame(CTOS_JOIN_GAME, body);
}

function writeDeckSizes(view: DataView, offset: number): void {
	const limits = [40, 60, 0, 15, 0, 15];
	limits.forEach((value, index) => view.setUint16(offset + index * 2, value, true));
}

/** Fixed 20-unit UTF-16LE field; the last unit stays 0 as the terminator. */
function writeUtf16(view: DataView, offset: number, text: string): void {
	const units = Math.min(text.length, NAME_UNITS - 1);
	for (let i = 0; i < units; i++) view.setUint16(offset + i * 2, text.charCodeAt(i), true);
}

interface BanlistCard {
	id: number;
}

/**
 * The hash EDOPro identifies a banlist by, folded over every entry with its
 * allowed copies (0 forbidden, 1 limited, 2 semi-limited, 3 whitelisted).
 */
export async function edoproBanlistHash(roomsUrl: string, name: string): Promise<number> {
	const response = await fetch(`${roomsUrl}/api/banlists/edopro/${encodeURIComponent(name)}`);
	const list = (await response.json()) as Record<
		"forbidden" | "limited" | "semiLimited" | "whitelisted",
		BanlistCard[]
	>;
	let hash = 0x7dfcee6a;
	const fold = (cards: BanlistCard[], copies: number): void => {
		for (const { id } of cards) {
			hash ^=
				(((id >>> 0) << 18) | (id >> 14)) ^
				((((id >>> 0) << (27 + copies)) >>> 0) | (id >>> (5 - copies)));
		}
	};
	fold(list.forbidden, 0);
	fold(list.limited, 1);
	fold(list.semiLimited, 2);
	fold(list.whitelisted, 3);
	return hash >>> 0;
}
