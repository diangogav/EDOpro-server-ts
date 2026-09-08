import { RankMother } from "@test-support/mothers/rank/RankMother";

import { BackfillDependencies, runBackfill } from "./backfill-points-ledger";
import { PlayerStatsSnapshotRow } from "../shared/stats/points-ledger/domain/buildReconciliationReport";
import { BackfillMatchRow } from "../shared/stats/points-ledger/domain/planLedgerBackfill";

type MakeDependenciesOverrides = Partial<
	Pick<BackfillDependencies, "resolveAlias" | "groupsFor" | "ranksByName" | "achievementPointsRows">
>;

function makeDependencies(
	rows: BackfillMatchRow[],
	playerStats: PlayerStatsSnapshotRow[] = [],
	overrides?: MakeDependenciesOverrides,
): BackfillDependencies & { insert: jest.Mock; writeReport: jest.Mock } {
	const globalRank = RankMother.create({ id: "rank-global", name: "Global" });
	const insert = jest.fn().mockResolvedValue(true);
	const writeReport = jest.fn().mockResolvedValue(undefined);

	return {
		matchRows: { fetchRows: () => Promise.resolve(rows) },
		resolveAlias: (name) => name,
		groupsFor: () => [],
		ranksByName: (name) => (name === "Global" ? globalRank : undefined),
		ledgerInserter: { insert },
		playerStatsRows: { fetchRows: () => Promise.resolve(playerStats) },
		achievementPointsRows: { fetchRows: () => Promise.resolve([]) },
		writeReport,
		logger: { info: jest.fn() },
		insert,
		...overrides,
	};
}

function makeRow(overrides?: Partial<BackfillMatchRow>): BackfillMatchRow {
	return {
		gameId: "game-1",
		userId: "user-1",
		season: 7,
		banListName: "",
		winner: true,
		points: 3,
		anulled: false,
		...overrides,
	};
}

describe("runBackfill", () => {
	it("plans entries but inserts nothing in dry-run mode", async () => {
		const deps = makeDependencies([makeRow()]);

		const result = await runBackfill(deps, { apply: false });

		expect(result.plan.entries).toHaveLength(1);
		expect(deps.insert).not.toHaveBeenCalled();
	});

	it("passes every planned entry to the insert port when applying", async () => {
		const deps = makeDependencies([makeRow()]);

		const result = await runBackfill(deps, { apply: true });

		expect(deps.insert).toHaveBeenCalledTimes(1);
		expect(deps.insert).toHaveBeenCalledWith(result.plan.entries[0]);
	});

	it("never calls the insert port for rows that plan zero entries", async () => {
		const deps = makeDependencies([makeRow({ banListName: "Unmapped List" })]);

		const result = await runBackfill(deps, { apply: true });

		expect(result.plan.unmappedBanLists).toEqual([{ banListName: "Unmapped List", matchRows: 1 }]);
		expect(deps.insert).not.toHaveBeenCalled();
	});

	it("writes the built reconciliation report through the injected writer", async () => {
		const statsRow = {
			userId: "user-1",
			rankId: "rank-global",
			rankName: "Global",
			season: 7,
			wins: 1,
			losses: 0,
			points: 3,
		};
		const deps = makeDependencies([makeRow()], [statsRow]);

		const result = await runBackfill(deps, { apply: false });

		expect(result.report.clean).toBe(true);
		expect(deps.writeReport).toHaveBeenCalledWith(result.report);
	});

	it("credits achievement points labeled with a ranked list to the group ranks it feeds, same as match points", async () => {
		const listRank = RankMother.create({ id: "rank-list", name: "2026.05 TCG" });
		const groupRank = RankMother.create({ id: "rank-group", name: "TCG" });
		const globalRank = RankMother.create({ id: "rank-global", name: "Global" });
		const ranks = new Map([
			["2026.05 TCG", listRank],
			["TCG", groupRank],
			["Global", globalRank],
		]);
		const listStats = {
			userId: "user-1",
			rankId: "rank-list",
			rankName: "2026.05 TCG",
			season: 7,
			wins: 1,
			losses: 0,
			points: 3 + 10, // match points + achievement points on the list rank itself
		};
		const groupStats = {
			userId: "user-1",
			rankId: "rank-group",
			rankName: "TCG",
			season: 7,
			wins: 1,
			losses: 0,
			points: 3 + 10, // group rank must ALSO receive the achievement points
		};
		const globalStats = {
			...listStats,
			rankId: "rank-global",
			rankName: "Global",
			points: 3, // Global is not a group the list feeds, so it never gets the achievement bonus
		};
		const deps = makeDependencies(
			[makeRow({ banListName: "2026.05 TCG" })],
			[listStats, groupStats, globalStats],
			{
				resolveAlias: (name) => name,
				groupsFor: (name) => (name === "2026.05 TCG" ? ["TCG"] : []),
				ranksByName: (name) => ranks.get(name),
				achievementPointsRows: {
					fetchRows: () =>
						Promise.resolve([{ userId: "user-1", rankName: "2026.05 TCG", season: 7, points: 10 }]),
				},
			},
		);

		const result = await runBackfill(deps, { apply: false });

		expect(result.report.clean).toBe(true);
		expect(result.report.mismatches).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ rankName: "TCG", achievementPoints: 10, deltaPoints: 0 }),
			]),
		);
	});
});
