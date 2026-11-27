import {
	challengeIsRanked,
	challengeRoomCommand,
	parseChallengeBestOf,
	isAdmittedToChallengeRoom,
	ChallengeRoom,
} from "./ChallengeRoom";

const room = (overrides: Partial<ChallengeRoom> = {}): ChallengeRoom => ({
	code: "abcdefghij012345",
	command: "goat",
	password: "secret",
	format: "goat",
	ranked: true,
	userIds: ["user-1", "user-2"],
	expiresAt: 1_000,
	...overrides,
});

describe("challengeRoomCommand", () => {
	it.each([
		["tcg", "toot"],
		["ocg", "oo"],
		["jtp-adv-2007-03", "jtp-2007-03"],
		["edison", "edison"],
		["goat", "goat"],
		["jtp", "jtp"],
		["genesys", "genesys"],
		["rush", "rush"],
		["pre", "pre"],
	])("builds the ranked command of %p from its room token", (format, command) => {
		expect(challengeRoomCommand(format, true)).toBe(command);
	});

	it("adds the casual token to a casual room", () => {
		expect(challengeRoomCommand("tcg", false)).toBe("toot,casual");
		expect(challengeRoomCommand("speed", false)).toBe("speed,casual");
	});

	it("returns null for a format outside the catalogue", () => {
		expect(challengeRoomCommand("tengu", false)).toBeNull();
	});
});

describe("challengeRoomCommand best of three", () => {
	it("adds the match token, before casual", () => {
		expect(challengeRoomCommand("goat", true, 3)).toBe("goat,m");
		expect(challengeRoomCommand("tcg", false, 3)).toBe("toot,m,casual");
		expect(challengeRoomCommand("goat", true, 1)).toBe("goat");
	});
});

describe("parseChallengeBestOf", () => {
	it("reads 1 or 3, takes one duel when the payload names none, and refuses anything else", () => {
		expect(parseChallengeBestOf(undefined)).toBe(1);
		expect(parseChallengeBestOf(1)).toBe(1);
		expect(parseChallengeBestOf(3)).toBe(3);
		expect(parseChallengeBestOf(2)).toBeNull();
		expect(parseChallengeBestOf("3")).toBeNull();
	});
});

describe("challengeIsRanked", () => {
	it("is ranked only between two accounts in a format other than Speed Duel", () => {
		expect(challengeIsRanked("goat", true)).toBe(true);
		expect(challengeIsRanked("speed", true)).toBe(false);
		expect(challengeIsRanked("goat", false)).toBe(false);
	});
});

describe("isAdmittedToChallengeRoom", () => {
	it("admits only the two accounts of a ranked room", () => {
		expect(isAdmittedToChallengeRoom(room(), "user-2")).toBe(true);
		expect(isAdmittedToChallengeRoom(room(), "user-3")).toBe(false);
		expect(isAdmittedToChallengeRoom(room(), undefined)).toBe(false);
	});

	it("admits anyone holding the code of a casual room", () => {
		const casual = room({ ranked: false, userIds: [] });

		expect(isAdmittedToChallengeRoom(casual, undefined)).toBe(true);
		expect(isAdmittedToChallengeRoom(casual, "user-3")).toBe(true);
	});
});
