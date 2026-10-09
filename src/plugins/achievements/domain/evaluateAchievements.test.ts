import { evaluateAchievements, EvaluationInput } from "./evaluateAchievements";

const base: EvaluationInput = {
	rankedWinsBefore: 5,
	rankedMatchesBefore: 20,
	currentStreakBefore: 0,
	ladderWinsBefore: 3,
	ladder: null,
	won: true,
};

const codesFor = (overrides: Partial<EvaluationInput>): string[] =>
	evaluateAchievements({ ...base, ...overrides }).map((candidate) => candidate.code);

describe("evaluateAchievements", () => {
	it("qualifies a player with wins for first_win and nothing else yet", () => {
		expect(codesFor({})).toEqual(["first_win"]);
	});

	it("awards nothing to a player who loses without any win", () => {
		expect(codesFor({ rankedWinsBefore: 0, won: false })).toEqual([]);
	});

	it("awards first_win on the first ranked win", () => {
		expect(codesFor({ rankedWinsBefore: 0, rankedMatchesBefore: 0 })).toEqual(["first_win"]);
	});

	it.each([
		[9, "wins_10"],
		[49, "wins_50"],
		[99, "wins_100"],
	])("awards %s -> %s when the win reaches the threshold", (winsBefore, code) => {
		expect(codesFor({ rankedWinsBefore: winsBefore })).toContain(code);
		expect(codesFor({ rankedWinsBefore: winsBefore - 1 })).not.toContain(code);
	});

	it("awards a threshold the player already passed but lacks", () => {
		const codes = codesFor({ rankedWinsBefore: 24 });

		expect(codes).toContain("wins_10");
		expect(codes).not.toContain("wins_50");
	});

	it("awards the wins thresholds on a loss when the totals already qualify", () => {
		expect(codesFor({ rankedWinsBefore: 25, won: false })).toContain("wins_10");
	});

	it.each([
		[2, "streak_3"],
		[4, "streak_5"],
		[9, "streak_10"],
	])("awards a streak of %s plus this win -> %s", (streakBefore, code) => {
		expect(codesFor({ currentStreakBefore: streakBefore })).toContain(code);
		expect(codesFor({ currentStreakBefore: streakBefore - 1 })).not.toContain(code);
	});

	it("awards every streak threshold covered by a longer streak", () => {
		const codes = codesFor({ currentStreakBefore: 5 });

		expect(codes).toEqual(expect.arrayContaining(["streak_3", "streak_5"]));
		expect(codes).not.toContain("streak_10");
	});

	it("awards no streak when the match is lost", () => {
		const codes = codesFor({ currentStreakBefore: 2, won: false });

		expect(codes.filter((code) => code.startsWith("streak_"))).toEqual([]);
	});

	it("awards the format code for the first win in a ladder", () => {
		expect(codesFor({ ladderWinsBefore: 0, ladder: "Edison" })).toContain(
			"format_first_win:Edison",
		);
	});

	it("awards the format code to a player with ladder wins who lacks it", () => {
		expect(codesFor({ ladderWinsBefore: 4, ladder: "TCG" })).toContain("format_first_win:TCG");
	});

	it("awards no format code without a ladder win or without a ladder", () => {
		expect(codesFor({ ladderWinsBefore: 0, ladder: "TCG", won: false })).toEqual(["first_win"]);
		expect(codesFor({ ladderWinsBefore: 3, ladder: null }).join()).not.toContain(
			"format_first_win",
		);
	});

	it("awards matches_100 on the hundredth ranked match, win or loss", () => {
		expect(codesFor({ rankedWinsBefore: 0, rankedMatchesBefore: 99, won: false })).toEqual([
			"matches_100",
		]);
		expect(codesFor({ rankedMatchesBefore: 99 })).toContain("matches_100");
		expect(codesFor({ rankedMatchesBefore: 98, won: false })).not.toContain("matches_100");
	});

	it("awards matches_100 once the total is already past it", () => {
		expect(codesFor({ rankedWinsBefore: 0, rankedMatchesBefore: 150, won: false })).toEqual([
			"matches_100",
		]);
	});

	it("returns every qualifying code once, in a stable order", () => {
		const codes = codesFor({
			rankedWinsBefore: 0,
			rankedMatchesBefore: 99,
			currentStreakBefore: 2,
			ladderWinsBefore: 0,
			ladder: "TCG",
		});

		expect(codes).toEqual(["first_win", "streak_3", "format_first_win:TCG", "matches_100"]);
	});
});
