import { RankMother } from "@test-support/mothers/rank/RankMother";

import { BackfillDependencies, runBackfill } from "./backfill-points-ledger";
import { PlayerStatsSnapshotRow } from "../shared/stats/points-ledger/domain/buildReconciliationReport";
import { BackfillMatchRow } from "../shared/stats/points-ledger/domain/planLedgerBackfill";

function makeDependencies(
	rows: BackfillMatchRow[],
	playerStats: PlayerStatsSnapshotRow[] = [],
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
});
