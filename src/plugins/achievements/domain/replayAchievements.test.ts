import { replayAchievements, ReplayedMatch } from "./replayAchievements";

const ladders = (banListName: string): string[] => {
	if (banListName === "TCG") return ["TCG"];
	if (banListName === "Edison") return ["Edison", "Legacy"];

	return [];
};

const win = (season = 1, banListName = "TCG"): ReplayedMatch => ({
	won: true,
	banListName,
	season,
});
const loss = (season = 1, banListName = "TCG"): ReplayedMatch => ({
	won: false,
	banListName,
	season,
});

const awarded = (matches: ReplayedMatch[]) =>
	new Map(replayAchievements(matches, ladders).map((a) => [a.code, a]));

describe("replayAchievements", () => {
	it("awards nothing for an empty history", () => {
		expect(replayAchievements([], ladders)).toEqual([]);
	});

	it("records the season of the first winning match for first_win", () => {
		const result = awarded([loss(1), loss(2), win(3), win(4)]);

		expect(result.get("first_win")?.season).toBe(3);
	});

	it("detects streak_3 from an early run even when the final streak is zero", () => {
		const result = awarded([win(1), win(1), win(2), loss(2), loss(2)]);

		expect(result.get("streak_3")?.season).toBe(2);
		expect(result.has("streak_5")).toBe(false);
	});

	it("resets the streak on a loss", () => {
		const result = awarded([win(), win(), loss(), win(), win()]);

		expect(result.has("streak_3")).toBe(false);
	});

	it("uses the season of the 10th win for wins_10", () => {
		const matches = [...Array.from({ length: 9 }, () => win(1)), loss(2), win(3), win(4)];

		const result = awarded(matches);

		expect(result.get("wins_10")?.season).toBe(3);
		expect(result.has("wins_50")).toBe(false);
	});

	it("awards matches_100 on the 100th counted match, wins or not", () => {
		const matches = [...Array.from({ length: 99 }, () => loss(1)), loss(5)];

		expect(awarded(matches).get("matches_100")?.season).toBe(5);
	});

	it("labels format_first_win with its ladder and awards every ladder a list feeds", () => {
		const result = awarded([win(2, "Edison")]);

		expect(result.get("format_first_win:Edison")).toEqual({
			code: "format_first_win:Edison",
			season: 2,
			labels: ["Edison"],
		});
		expect(result.get("format_first_win:Legacy")?.labels).toEqual(["Legacy"]);
		expect(result.get("first_win")?.labels).toEqual([]);
	});

	it("awards a ladder first win in the season of that ladder's first win", () => {
		const result = awarded([win(1, "TCG"), loss(2, "Edison"), win(3, "Edison")]);

		expect(result.get("format_first_win:TCG")?.season).toBe(1);
		expect(result.get("format_first_win:Edison")?.season).toBe(3);
	});

	it("counts a match with no ladders toward wins and matches without a ladder code", () => {
		const result = awarded([win(4, "Casual")]);

		expect(result.get("first_win")?.season).toBe(4);
		expect([...result.keys()].some((code) => code.startsWith("format_first_win"))).toBe(false);
	});

	it("returns each code once", () => {
		const result = replayAchievements(
			Array.from({ length: 12 }, () => win(1, "Edison")),
			ladders,
		);
		const codes = result.map((a) => a.code);

		expect(new Set(codes).size).toBe(codes.length);
	});
});
