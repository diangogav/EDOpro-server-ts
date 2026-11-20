import { Rule } from "../../../shared/deck/domain/Rule";
import { RoomAttr } from "./Room";

/** DUEL_MODE_SPEED of the Project Ignis core (ocgapi_constants.h). */
const SPEED_DUEL_FLAGS = 0x628000;
/** What an EDOPro client sends as its handshake (SERVER_HANDSHAKE, network.h). */
const SERVER_HANDSHAKE = 4043399681;
/** The time limit, in seconds, of a room opened without one of its own. */
const DEFAULT_TIME_LIMIT = 450;

/**
 * The attributes of a Speed Duel room the server opens for its own clients.
 *
 * They are what EDOPro's host form sets when "Speed Duel" is chosen
 * (menu_handler.cpp): the Speed Duel flags, no forbidden type, a hand of 4
 * and decks of 20-30 / 0-6 / 0-6, plus the format's 4000 LP. A Skill Card
 * carries a scope the OCG and TCG checks refuse, so every scope is allowed
 * and the ban list, a whitelist, is the only card filter. Nothing here comes
 * from the request but the room's identity and the match length: a Speed
 * Duel room is always a Speed Duel.
 */
export function speedDuelRoomAttributes({
	id,
	name,
	password,
	bestOf,
	banListHash,
}: {
	id: number;
	name: string;
	password: string;
	bestOf: 1 | 3;
	banListHash: number;
}): RoomAttr {
	return {
		id,
		name,
		notes: "Speed Duel",
		mode: 0,
		needPass: password !== "",
		team0: 1,
		team1: 1,
		bestOf,
		duelFlag: BigInt(SPEED_DUEL_FLAGS),
		duelFlagsHight: 0,
		duelFlagsLow: SPEED_DUEL_FLAGS,
		forbiddenTypes: 0,
		extraRules: 0,
		startLp: 4000,
		startHand: 4,
		drawCount: 1,
		timeLimit: DEFAULT_TIME_LIMIT,
		rule: Rule.ALL,
		noCheck: false,
		noShuffle: false,
		banListHash,
		mainMin: 20,
		mainMax: 30,
		extraMin: 0,
		extraMax: 6,
		sideMin: 0,
		sideMax: 6,
		duelRule: 0,
		handshake: SERVER_HANDSHAKE,
		password,
		ranked: false,
		createdByServer: true,
	};
}
