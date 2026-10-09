import { evaluateAchievements, EvaluationInput } from "./evaluateAchievements";

const base: EvaluationInput = {
	rankedWinsBefore: 5,
	rankedMatchesBefore: 20,
	currentStreakBefore: 0,
	ladderWinsBefore: 3,
	ladder: "TCG",
	won: true,
};

const codesFor = (overrides: Partial<EvaluationInput>): string[] =>
	evaluateAchievements({ ...base, ...overrides }).map((candidate) => candidate.code);

describe("evaluateAchievements", () => {
	it("awards nothing for an ordinary win", () => {
		expect(codesFor({})).toEqual([]);
	});

	it("awards first_win on the first ranked win", () => {
		expect(codesFor({ rankedWinsBefore: 0, rankedMatchesBefore: 0, ladderWinsBefore: 1 })).toEqual([
			"first_win",
		]);
	});

	it("does not award first_win when the player already has wins", () => {
		expect(codesFor({ rankedWinsBefore: 1 })).not.toContain("first_win");
	});

	it.each([
		[9, "wins_10"],
		[49, "wins_50"],
		[99, "wins_100"],
	])("awards %s -> %s only when the win reaches the threshold", (winsBefore, code) => {
		expect(codesFor({ rankedWinsBefore: winsBefore })).toContain(code);
		expect(codesFor({ rankedWinsBefore: winsBefore + 1 })).not.toContain(code);
		expect(codesFor({ rankedWinsBefore: winsBefore - 1 })).not.toContain(code);
	});

	it("does not award a wins threshold on a loss", () => {
		expect(codesFor({ rankedWinsBefore: 9, won: false })).not.toContain("wins_10");
	});

	it.each([
		[2, "streak_3"],
		[4, "streak_5"],
		[9, "streak_10"],
	])("awards a streak of %s plus this win -> %s", (streakBefore, code) => {
		expect(codesFor({ currentStreakBefore: streakBefore })).toContain(code);
		expect(codesFor({ currentStreakBefore: streakBefore + 1 })).not.toContain(code);
	});

	it("does not award a streak when the match is lost", () => {
		expect(codesFor({ currentStreakBefore: 2, won: false })).toEqual([]);
	});

	it("awards the format code for the first win in a ladder", () => {
		expect(codesFor({ ladderWinsBefore: 0, ladder: "Edison" })).toEqual([
			"format_first_win:Edison",
		]);
	});

	it("does not award the format code on a loss or after a previous ladder win", () => {
		expect(codesFor({ ladderWinsBefore: 0, won: false })).toEqual([]);
		expect(codesFor({ ladderWinsBefore: 1 })).toEqual([]);
	});

	it("awards matches_100 on the hundredth ranked match, win or loss", () => {
		expect(codesFor({ rankedMatchesBefore: 99, won: false })).toEqual(["matches_100"]);
		expect(codesFor({ rankedMatchesBefore: 99 })).toContain("matches_100");
		expect(codesFor({ rankedMatchesBefore: 100, won: false })).toEqual([]);
	});

	it("returns every code reached by one match without duplicates", () => {
		const codes = codesFor({
			rankedWinsBefore: 0,
			rankedMatchesBefore: 99,
			currentStreakBefore: 2,
			ladderWinsBefore: 0,
		});

		expect(codes).toEqual(["first_win", "streak_3", "format_first_win:TCG", "matches_100"]);
		expect(new Set(codes).size).toBe(codes.length);
	});
});
