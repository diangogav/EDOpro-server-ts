/**
 * The room two players agreed on through a direct challenge. The server keeps
 * the whole room (command, password, who may sit) and hands both players only
 * a short code: a join command must fit the 19-character password field of
 * the YGOPro join message, and a full command with its password does not.
 */
export interface ChallengeRoom {
	/** What players send to reach the room: `ch#<code>`. */
	readonly code: string;
	/** Room command the join is rewritten to, e.g. `goat` or `toot,casual`. */
	readonly command: string;
	/** Room password the join is rewritten to; never leaves the server. */
	readonly password: string;
	readonly format: string;
	readonly ranked: boolean;
	/** The two accounts allowed to sit in a ranked room; empty for a casual one. */
	readonly userIds: readonly string[];
	/** Clock time after which the code no longer opens the room. */
	readonly expiresAt: number;
}

/** A challenge is one duel, or a match decided by two duels won out of three. */
export type ChallengeBestOf = 1 | 3;

/** The best-of a challenge payload asks for: 1 when it names none, null when it is neither 1 nor 3. */
export function parseChallengeBestOf(value: unknown): ChallengeBestOf | null {
	if (value === undefined) {
		return 1;
	}

	return value === 1 || value === 3 ? value : null;
}

/** Command segment of a challenge join: `ch#<code>`. */
export const CHALLENGE_COMMAND = "ch";

export const CHALLENGE_CODE_PATTERN = /^[0-9a-z]{16}$/;

/** Speed Duel rooms are never ranked. */
const UNRANKED_FORMATS: ReadonlySet<string> = new Set(["speed"]);

/** Each challenge format's room token, as the client's create-room list builds it. */
const FORMAT_TOKENS: Readonly<Record<string, string>> = {
	tcg: "toot",
	ocg: "oo",
	edison: "edison",
	goat: "goat",
	jtp: "jtp",
	"jtp-adv-2007-03": "jtp-2007-03",
	genesys: "genesys",
	rush: "rush",
	pre: "pre",
	speed: "speed",
};

/** Ranked when both players are accounts and the format can be ranked; casual otherwise. */
export function challengeIsRanked(format: string, bothAccounts: boolean): boolean {
	return bothAccounts && !UNRANKED_FORMATS.has(format);
}

/**
 * The room command for a challenge in `format`. A casual room carries the
 * `casual` token, so an account's ticket does not turn it ranked; a best of
 * three carries the `m` token. Null for a format outside the catalogue.
 */
export function challengeRoomCommand(
	format: string,
	ranked: boolean,
	bestOf: ChallengeBestOf = 1,
): string | null {
	const token = Object.hasOwn(FORMAT_TOKENS, format) ? FORMAT_TOKENS[format] : undefined;
	if (token === undefined) {
		return null;
	}
	const tokens = [token, ...(bestOf === 3 ? ["m"] : []), ...(ranked ? [] : ["casual"])];

	return tokens.join(",");
}

/** A ranked room seats only its two accounts; a casual room anyone with the code. */
export function isAdmittedToChallengeRoom(
	room: ChallengeRoom,
	userId: string | undefined | null,
): boolean {
	if (!room.ranked) {
		return true;
	}

	return typeof userId === "string" && room.userIds.includes(userId);
}
