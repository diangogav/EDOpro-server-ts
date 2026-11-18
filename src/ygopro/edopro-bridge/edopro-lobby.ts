import { HostInfo } from "ygopro-msg-encode";

const DUEL_OBSOLETE_IGNITION = 0x100;
const DUEL_PZONE = 0x800;
const DUEL_EMZONE = 0x2000;
const DUEL_FSX_MMZONE = 0x4000;

export interface EdoproHostInfo {
	/** The fields a YGOPro lobby understands, ready for `YGOProStocJoinGame.info`. */
	readonly hostInfo: HostInfo;
	readonly duelFlagsLow: number;
	readonly duelFlagsHigh: number;
	readonly team1: number;
	readonly team2: number;
	readonly bestOf: number;
}

/** Decode the body of an EDOPro STOC_JOIN_GAME (the 68-byte HostInfo). */
export function decodeEdoproHostInfo(body: Uint8Array): EdoproHostInfo {
	const view = new DataView(body.buffer, body.byteOffset, body.byteLength);
	const duelFlagsLow = view.getUint32(44, true);
	const team1 = view.getInt32(32, true);
	const team2 = view.getInt32(36, true);
	const bestOf = view.getInt32(40, true);
	const hostInfo = new HostInfo();
	hostInfo.lflist = view.getUint32(0, true);
	hostInfo.rule = view.getUint8(4);
	hostInfo.mode = ygoproMode(team1, team2, bestOf);
	hostInfo.duel_rule = duelRuleFromFlags(duelFlagsLow);
	hostInfo.no_check_deck = view.getUint8(7);
	hostInfo.no_shuffle_deck = view.getUint8(8);
	hostInfo.start_lp = view.getUint32(12, true);
	hostInfo.start_hand = view.getUint8(16);
	hostInfo.draw_count = view.getUint8(17);
	hostInfo.time_limit = view.getUint16(18, true);
	return {
		hostInfo,
		duelFlagsLow,
		duelFlagsHigh: view.getUint32(20, true),
		team1,
		team2,
		bestOf,
	};
}

const MODE_SINGLE = 0;
const MODE_MATCH = 1;
const MODE_TAG = 2;

/**
 * A YGOPro lobby reads one `mode`: single duel, match or tag. EDOPro leaves
 * that byte at 0 and says the same with the team sizes and a "best of" count,
 * so a best-of-three room copied byte for byte reads as a single duel.
 */
function ygoproMode(team1: number, team2: number, bestOf: number): number {
	if (team1 > 1 || team2 > 1) return MODE_TAG;

	return bestOf > 1 ? MODE_MATCH : MODE_SINGLE;
}

/**
 * EDOPro describes the field with flags, not a Master Rule number; this reads
 * the number back from the flags each Master Rule sets.
 */
export function duelRuleFromFlags(duelFlagsLow: number): number {
	if ((duelFlagsLow & DUEL_EMZONE) !== 0) return (duelFlagsLow & DUEL_FSX_MMZONE) !== 0 ? 5 : 4;
	if ((duelFlagsLow & DUEL_PZONE) !== 0) return 3;
	return (duelFlagsLow & DUEL_OBSOLETE_IGNITION) !== 0 ? 1 : 2;
}
