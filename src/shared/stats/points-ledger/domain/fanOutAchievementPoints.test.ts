import { RankMother } from "@test-support/mothers/rank/RankMother";

import { AchievementPointsRow } from "./buildReconciliationReport";
import { fanOutAchievementPoints } from "./fanOutAchievementPoints";

function makeRow(overrides?: Partial<AchievementPointsRow>): AchievementPointsRow {
	return {
		userId: "user-1",
		rankName: "2026.05 TCG",
		season: 7,
		points: 10,
		...overrides,
	};
}

describe("fanOutAchievementPoints", () => {
	it("fans a ranked list label out to the list rank, and its group ranks (not Global)", () => {
		const ranks = new Map([
			["2026.05 TCG", RankMother.create({ id: "rank-list", name: "2026.05 TCG" })],
			["TCG", RankMother.create({ id: "rank-group", name: "TCG" })],
		]);
		const row = makeRow();

		const result = fanOutAchievementPoints(
			[row],
			(name) => name,
			(name) => (name === "2026.05 TCG" ? ["TCG"] : []),
			(name) => ranks.get(name),
		);

		expect(result.rows).toEqual([
			{ userId: "user-1", rankName: "2026.05 TCG", season: 7, points: 10 },
			{ userId: "user-1", rankName: "TCG", season: 7, points: 10 },
		]);
		expect(result.unmappedLabels).toEqual([]);
	});

	it('credits only "Global" for a "Global" label, never calling groupsFor', () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const groupsFor = jest.fn().mockReturnValue(["should-never-be-credited"]);
		const row = makeRow({ rankName: "Global" });

		const result = fanOutAchievementPoints(
			[row],
			(name) => name,
			groupsFor,
			(name) => ranks.get(name),
		);

		expect(result.rows).toEqual([{ userId: "user-1", rankName: "Global", season: 7, points: 10 }]);
		expect(groupsFor).not.toHaveBeenCalled();
	});

	it('credits only "N/A" for an "N/A" label, never calling groupsFor', () => {
		const ranks = new Map([["N/A", RankMother.create({ id: "rank-na", name: "N/A" })]]);
		const groupsFor = jest.fn().mockReturnValue(["should-never-be-credited"]);
		const row = makeRow({ rankName: "N/A" });

		const result = fanOutAchievementPoints(
			[row],
			(name) => name,
			groupsFor,
			(name) => ranks.get(name),
		);

		expect(result.rows).toEqual([{ userId: "user-1", rankName: "N/A", season: 7, points: 10 }]);
		expect(groupsFor).not.toHaveBeenCalled();
	});

	it("resolves an alias before the rank lookup and before grouping", () => {
		const ranks = new Map([
			["JTP", RankMother.create({ id: "rank-jtp", name: "JTP" })],
			["JTP All", RankMother.create({ id: "rank-jtp-all", name: "JTP All" })],
		]);
		const resolveAlias = jest.fn().mockReturnValue("JTP");
		const groupsFor = jest.fn().mockReturnValue(["JTP All"]);
		const row = makeRow({ rankName: "JTP (Original)" });

		const result = fanOutAchievementPoints([row], resolveAlias, groupsFor, (name) =>
			ranks.get(name),
		);

		expect(resolveAlias).toHaveBeenCalledWith("JTP (Original)");
		expect(groupsFor).toHaveBeenCalledWith("JTP");
		expect(result.rows).toEqual([
			{ userId: "user-1", rankName: "JTP", season: 7, points: 10 },
			{ userId: "user-1", rankName: "JTP All", season: 7, points: 10 },
		]);
	});

	it("surfaces a label whose resolved name has no matching rank, instead of silently dropping it", () => {
		const row = makeRow({ rankName: "Retired List" });

		const result = fanOutAchievementPoints(
			[row],
			(name) => name,
			() => [],
			() => undefined,
		);

		expect(result.rows).toEqual([]);
		expect(result.unmappedLabels).toEqual([{ label: "Retired List", occurrences: 1 }]);
	});

	it("surfaces the whole label as unmapped when the list rank exists but a fed group rank does not", () => {
		const ranks = new Map([
			["2026.05 TCG", RankMother.create({ id: "rank-list", name: "2026.05 TCG" })],
		]);
		const row = makeRow();

		const result = fanOutAchievementPoints(
			[row],
			(name) => name,
			(name) => (name === "2026.05 TCG" ? ["TCG"] : []),
			(name) => ranks.get(name),
		);

		expect(result.rows).toEqual([]);
		expect(result.unmappedLabels).toEqual([{ label: "2026.05 TCG", occurrences: 1 }]);
	});

	it("counts repeated occurrences of the same unmapped label", () => {
		const rows = [
			makeRow({ rankName: "Retired List", userId: "user-1" }),
			makeRow({ rankName: "Retired List", userId: "user-2" }),
		];

		const result = fanOutAchievementPoints(
			rows,
			(name) => name,
			() => [],
			() => undefined,
		);

		expect(result.unmappedLabels).toEqual([{ label: "Retired List", occurrences: 2 }]);
	});
});
