import { RankMother } from "@test-support/mothers/rank/RankMother";

import { BackfillMatchRow, planLedgerBackfill } from "./planLedgerBackfill";

function makeRow(overrides?: Partial<BackfillMatchRow>): BackfillMatchRow {
	return {
		gameId: "game-1",
		userId: "user-1",
		season: 7,
		banListName: "2026.05 TCG",
		winner: true,
		points: 3,
		anulled: false,
		...overrides,
	};
}

function expectedEntry(row: BackfillMatchRow, rankId: string) {
	return {
		gameId: row.gameId,
		userId: row.userId,
		rankId,
		season: row.season,
		kind: "applied" as const,
		cycle: 0,
		pointsDelta: row.points,
		winsDelta: row.winner ? 1 : 0,
		lossesDelta: row.winner ? 0 : 1,
	};
}

describe("planLedgerBackfill", () => {
	it("fans out a named banlist to the list rank, Global, and its group ranks", () => {
		const ranks = new Map([
			["2026.05 TCG", RankMother.create({ id: "rank-list", name: "2026.05 TCG" })],
			["Global", RankMother.create({ id: "rank-global", name: "Global" })],
			["TCG", RankMother.create({ id: "rank-group", name: "TCG" })],
		]);
		const row = makeRow();

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			(name) => (name === "2026.05 TCG" ? ["TCG"] : []),
			(name) => ranks.get(name),
		);

		expect(result.entries).toEqual([
			expectedEntry(row, "rank-list"),
			expectedEntry(row, "rank-global"),
			expectedEntry(row, "rank-group"),
		]);
	});

	it('credits only "N/A" and Global, never a group, for the "N/A" classification', () => {
		const ranks = new Map([
			["N/A", RankMother.create({ id: "rank-na", name: "N/A" })],
			["Global", RankMother.create({ id: "rank-global", name: "Global" })],
		]);
		const groupsFor = jest.fn().mockReturnValue(["should-never-be-credited"]);
		const row = makeRow({ banListName: "N/A" });

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			groupsFor,
			(name) => ranks.get(name),
		);

		expect(result.entries).toEqual([
			expectedEntry(row, "rank-na"),
			expectedEntry(row, "rank-global"),
		]);
		expect(groupsFor).not.toHaveBeenCalled();
	});

	it("credits only Global with no banlist at all, and still writes a zero-point row", () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const row = makeRow({ banListName: "", points: 0, winner: false });

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			() => [],
			(name) => ranks.get(name),
		);

		expect(result.entries).toEqual([expectedEntry(row, "rank-global")]);
	});

	it("resolves an alias before the rank lookup and before grouping", () => {
		const ranks = new Map([
			["JTP", RankMother.create({ id: "rank-canonical", name: "JTP" })],
			["Global", RankMother.create({ id: "rank-global", name: "Global" })],
		]);
		const resolveAlias = jest.fn().mockReturnValue("JTP");
		const groupsFor = jest.fn().mockReturnValue([]);
		const row = makeRow({ banListName: "JTP (Original)" });

		const result = planLedgerBackfill([row], resolveAlias, groupsFor, (name) => ranks.get(name));

		expect(resolveAlias).toHaveBeenCalledWith("JTP (Original)");
		expect(groupsFor).toHaveBeenCalledWith("JTP");
		expect(result.entries).toEqual([
			expectedEntry(row, "rank-canonical"),
			expectedEntry(row, "rank-global"),
		]);
	});

	it("surfaces an unresolvable banlist name instead of silently skipping it", () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const row = makeRow({ banListName: "Retired List" });

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			() => [],
			(name) => ranks.get(name),
		);

		expect(result.entries).toHaveLength(0);
		expect(result.unmappedBanLists).toEqual([{ banListName: "Retired List", matchRows: 1 }]);
	});

	it("still credits an anulled match and lists its game id as pre-flagged", () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const row = makeRow({ banListName: "", anulled: true, gameId: "game-annulled" });

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			() => [],
			(name) => ranks.get(name),
		);

		expect(result.entries).toEqual([expectedEntry(row, "rank-global")]);
		expect(result.preFlaggedGameIds).toEqual(["game-annulled"]);
	});

	it("skips a match row for an unknown user, producing no entries, and counts it", () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const row = makeRow({ banListName: "", userId: "user-missing" });

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			() => [],
			(name) => ranks.get(name),
			(userId) => userId !== "user-missing",
		);

		expect(result.entries).toHaveLength(0);
		expect(result.skippedMissingUsers).toEqual({
			matchRows: 1,
			users: ["user-missing"],
			gameIds: ["game-1"],
		});
	});

	it("lists a game id in skippedMissingUsers.gameIds only when every row for that game belongs to a missing user", () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const bothMissingRows = [
			makeRow({ gameId: "game-both-missing", userId: "user-missing-a", banListName: "" }),
			makeRow({ gameId: "game-both-missing", userId: "user-missing-b", banListName: "" }),
		];
		const onePresentRows = [
			makeRow({ gameId: "game-one-present", userId: "user-missing-a", banListName: "" }),
			makeRow({ gameId: "game-one-present", userId: "user-present", banListName: "" }),
		];
		const knownUserIds = (userId: string) => userId === "user-present";

		const result = planLedgerBackfill(
			[...bothMissingRows, ...onePresentRows],
			(name) => name,
			() => [],
			(name) => ranks.get(name),
			knownUserIds,
		);

		expect(result.skippedMissingUsers.gameIds).toEqual(["game-both-missing"]);
		expect(result.skippedMissingUsers.matchRows).toBe(3);
		expect(result.skippedMissingUsers.users).toEqual(["user-missing-a", "user-missing-b"]);
		expect(result.entries).toEqual([expectedEntry(onePresentRows[1], "rank-global")]);
	});

	it("treats every user as known when no predicate is given, preserving prior behaviour", () => {
		const ranks = new Map([["Global", RankMother.create({ id: "rank-global", name: "Global" })]]);
		const row = makeRow({ banListName: "" });

		const result = planLedgerBackfill(
			[row],
			(name) => name,
			() => [],
			(name) => ranks.get(name),
		);

		expect(result.skippedMissingUsers).toEqual({ matchRows: 0, users: [], gameIds: [] });
	});

	it("produces the exact same output on repeated runs of the same input", () => {
		const ranks = new Map([
			["2026.05 TCG", RankMother.create({ id: "rank-list", name: "2026.05 TCG" })],
			["Global", RankMother.create({ id: "rank-global", name: "Global" })],
			["TCG", RankMother.create({ id: "rank-group", name: "TCG" })],
		]);
		const rows = [
			makeRow({ gameId: "game-a", userId: "user-a" }),
			makeRow({ gameId: "game-b", userId: "user-b", banListName: "Unmapped List" }),
			makeRow({ gameId: "game-c", userId: "user-c", anulled: true }),
		];
		const resolveAlias = (name: string) => name;
		const groupsFor = (name: string) => (name === "2026.05 TCG" ? ["TCG"] : []);
		const ranksByName = (name: string) => ranks.get(name);

		const first = planLedgerBackfill(rows, resolveAlias, groupsFor, ranksByName);
		const second = planLedgerBackfill(rows, resolveAlias, groupsFor, ranksByName);

		expect(second).toEqual(first);
	});
});
