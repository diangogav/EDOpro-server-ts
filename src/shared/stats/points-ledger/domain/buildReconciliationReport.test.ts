import {
	buildReconciliationReport,
	PlayerStatsSnapshotRow,
	ReconciliationInput,
} from "./buildReconciliationReport";
import { PlanLedgerBackfillResult } from "./planLedgerBackfill";

function makePlanResult(overrides?: Partial<PlanLedgerBackfillResult>): PlanLedgerBackfillResult {
	return {
		entries: [
			{
				gameId: "game-1",
				userId: "user-1",
				rankId: "rank-1",
				season: 7,
				kind: "applied",
				cycle: 0,
				pointsDelta: 10,
				winsDelta: 1,
				lossesDelta: 0,
			},
		],
		unmappedBanLists: [],
		rankSummaries: [
			{ rankId: "rank-1", rankName: "Global", entryCount: 1, gameCount: 1, userCount: 1 },
		],
		preFlaggedGameIds: [],
		skippedMissingUsers: { matchRows: 0, users: [], gameIds: [] },
		...overrides,
	};
}

function makeStatsRow(overrides?: Partial<PlayerStatsSnapshotRow>): PlayerStatsSnapshotRow {
	return {
		userId: "user-1",
		rankId: "rank-1",
		rankName: "Global",
		season: 7,
		wins: 1,
		losses: 0,
		points: 10,
		...overrides,
	};
}

function makeInput(overrides?: Partial<ReconciliationInput>): ReconciliationInput {
	return {
		planResult: makePlanResult(),
		gameIds: ["game-1"],
		playerStats: [makeStatsRow()],
		achievementPoints: [],
		unmappedAchievementLabels: [],
		...overrides,
	};
}

describe("buildReconciliationReport", () => {
	it("is clean when the ledger sum plus achievement points equals player_stats for every key", () => {
		const report = buildReconciliationReport(makeInput());

		expect(report.clean).toBe(true);
		expect(report.mismatches[0]).toMatchObject({
			userId: "user-1",
			deltaWins: 0,
			deltaLosses: 0,
			deltaPoints: 0,
		});
	});

	it("is not clean when player_stats points, wins, or losses differ from the ledger", () => {
		const pointsDiff = buildReconciliationReport(
			makeInput({ playerStats: [makeStatsRow({ points: 15 })] }),
		);
		const winsDiff = buildReconciliationReport(
			makeInput({ playerStats: [makeStatsRow({ wins: 2 })] }),
		);

		expect(pointsDiff.clean).toBe(false);
		expect(pointsDiff.mismatches[0]).toMatchObject({
			statsPoints: 15,
			ledgerPoints: 10,
			deltaPoints: 5,
		});
		expect(winsDiff.clean).toBe(false);
		expect(winsDiff.mismatches[0]).toMatchObject({ statsWins: 2, ledgerWins: 1, deltaWins: 1 });
	});

	it("lets achievement points bridge an otherwise-mismatching key back to clean", () => {
		const report = buildReconciliationReport(
			makeInput({
				playerStats: [makeStatsRow({ points: 15 })],
				achievementPoints: [{ userId: "user-1", rankName: "Global", season: 7, points: 5 }],
			}),
		);

		expect(report.clean).toBe(true);
		expect(report.mismatches[0]).toMatchObject({ achievementPoints: 5, deltaPoints: 0 });
	});

	it("is not clean with an unmapped ban list or an incomplete game, even if every key matches", () => {
		const unmapped = buildReconciliationReport(
			makeInput({
				planResult: makePlanResult({
					unmappedBanLists: [{ banListName: "Retired List", matchRows: 2 }],
				}),
			}),
		);
		const incomplete = buildReconciliationReport(makeInput({ gameIds: ["game-1", "game-2"] }));

		expect(unmapped.clean).toBe(false);
		expect(unmapped.unmappedBanLists).toEqual([{ banListName: "Retired List", matchRows: 2 }]);
		expect(incomplete.clean).toBe(false);
		expect(incomplete.incompleteGames).toEqual(["game-2"]);
	});

	it("lists pre-flagged games without affecting clean", () => {
		const report = buildReconciliationReport(
			makeInput({ planResult: makePlanResult({ preFlaggedGameIds: ["game-1"] }) }),
		);

		expect(report.clean).toBe(true);
		expect(report.preFlaggedGames).toEqual({ count: 1, gameIds: ["game-1"] });
	});

	it("flags a player_stats row with no ledger entries and blocks clean", () => {
		const orphan = makeStatsRow({
			userId: "user-2",
			rankId: "rank-2",
			rankName: "Other",
			points: 5,
		});
		const report = buildReconciliationReport(makeInput({ playerStats: [makeStatsRow(), orphan] }));

		expect(report.clean).toBe(false);
		expect(report.orphanStatsCount).toBe(1);
		expect(report.mismatches).toContainEqual(
			expect.objectContaining({
				userId: "user-2",
				ledgerPoints: 0,
				statsPoints: 5,
				deltaPoints: 5,
			}),
		);
	});

	it("produces the exact same report on repeated calls with the same input", () => {
		const input = makeInput();

		const first = buildReconciliationReport(input);
		const second = buildReconciliationReport(input);

		expect(second).toEqual(first);
	});

	it("sums achievement points from multiple rows sharing the same user/rank/season key", () => {
		const report = buildReconciliationReport(
			makeInput({
				playerStats: [makeStatsRow({ points: 18 })],
				achievementPoints: [
					{ userId: "user-1", rankName: "Global", season: 7, points: 5 },
					{ userId: "user-1", rankName: "Global", season: 7, points: 3 },
				],
			}),
		);

		expect(report.clean).toBe(true);
		expect(report.mismatches[0]).toMatchObject({ achievementPoints: 8, deltaPoints: 0 });
	});

	it("surfaces unmapped achievement labels passed through and blocks clean", () => {
		const report = buildReconciliationReport(
			makeInput({ unmappedAchievementLabels: [{ label: "Retired List", occurrences: 2 }] }),
		);

		expect(report.clean).toBe(false);
		expect(report.unmappedAchievementLabels).toEqual([{ label: "Retired List", occurrences: 2 }]);
	});

	it("excludes a fully-missing-user game from incompleteGames but keeps a genuinely incomplete one", () => {
		const report = buildReconciliationReport(
			makeInput({
				planResult: makePlanResult({
					skippedMissingUsers: { matchRows: 2, users: ["user-gone"], gameIds: ["game-both-gone"] },
				}),
				gameIds: ["game-1", "game-both-gone", "game-unmapped"],
			}),
		);

		expect(report.incompleteGames).toEqual(["game-unmapped"]);
	});

	it("excludes player_stats rows of missing users from mismatches and counts them separately", () => {
		const orphanOfMissingUser = makeStatsRow({
			userId: "user-gone",
			rankId: "rank-2",
			rankName: "Other",
			points: 5,
		});
		const report = buildReconciliationReport(
			makeInput({
				planResult: makePlanResult({
					skippedMissingUsers: { matchRows: 1, users: ["user-gone"], gameIds: [] },
				}),
				playerStats: [makeStatsRow(), orphanOfMissingUser],
			}),
		);

		expect(report.clean).toBe(true);
		expect(report.orphanStatsOfMissingUsers).toBe(1);
		expect(report.orphanStatsCount).toBe(0);
		expect(report.mismatches).not.toContainEqual(expect.objectContaining({ userId: "user-gone" }));
	});

	it("passes skippedMissingUsers through without affecting clean", () => {
		const report = buildReconciliationReport(
			makeInput({
				planResult: makePlanResult({
					skippedMissingUsers: {
						matchRows: 3,
						users: ["user-a", "user-b"],
						gameIds: ["game-both-gone"],
					},
				}),
			}),
		);

		expect(report.clean).toBe(true);
		expect(report.skippedMissingUsers).toEqual({
			matchRows: 3,
			users: ["user-a", "user-b"],
			gameIds: ["game-both-gone"],
		});
	});

	it("counts only the keys that actually differ in differingKeys, unlike the full mismatches list", () => {
		const report = buildReconciliationReport(
			makeInput({
				playerStats: [makeStatsRow(), makeStatsRow({ userId: "user-2", points: 999 })],
			}),
		);

		expect(report.mismatches).toHaveLength(2);
		expect(report.differingKeys).toBe(1);
	});
});
