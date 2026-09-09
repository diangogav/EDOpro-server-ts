import { UnmappedAchievementLabel } from "./fanOutAchievementPoints";
import { PlanLedgerBackfillResult } from "./planLedgerBackfill";

export type PlayerStatsSnapshotRow = {
	userId: string;
	rankId: string;
	rankName: string;
	season: number;
	wins: number;
	losses: number;
	points: number;
};

export type AchievementPointsRow = {
	userId: string;
	rankName: string;
	season: number;
	points: number;
};

export type ReconciliationKey = { userId: string; rankName: string; season: number };

export type ReconciliationMismatch = ReconciliationKey & {
	ledgerWins: number;
	ledgerLosses: number;
	ledgerPoints: number;
	achievementPoints: number;
	statsWins: number;
	statsLosses: number;
	statsPoints: number;
	deltaWins: number;
	deltaLosses: number;
	deltaPoints: number;
};

export type ReconciliationReport = {
	/** Every (user, rank, season) key compared, reconciled or not — see `differingKeys`. */
	mismatches: ReconciliationMismatch[];
	/** Count of `mismatches` rows that actually differ (any non-zero delta). */
	differingKeys: number;
	preFlaggedGames: { count: number; gameIds: string[] };
	unmappedBanLists: PlanLedgerBackfillResult["unmappedBanLists"];
	/** Achievement labels fanned out by `fanOutAchievementPoints` with no matching rank. */
	unmappedAchievementLabels: UnmappedAchievementLabel[];
	incompleteGames: string[];
	/** Count of `mismatches` rows for a player_stats key with zero ledger entries. */
	orphanStatsCount: number;
	/** Hard-deleted-user match rows/games skipped by the planner — see `skippedMissingUsers`. */
	skippedMissingUsers: PlanLedgerBackfillResult["skippedMissingUsers"];
	/** `player_stats` rows belonging to a missing user — excluded from `mismatches`/`orphanStatsCount`. */
	orphanStatsOfMissingUsers: number;
	clean: boolean;
};

export type ReconciliationInput = {
	planResult: PlanLedgerBackfillResult;
	gameIds: string[];
	playerStats: PlayerStatsSnapshotRow[];
	/** Already fanned out to group ranks — see `fanOutAchievementPoints`. */
	achievementPoints: AchievementPointsRow[];
	unmappedAchievementLabels: UnmappedAchievementLabel[];
};

type LedgerAggregate = ReconciliationKey & { wins: number; losses: number; points: number };

const keyOf = (userId: string, rankName: string, season: number): string =>
	`${userId}|${rankName}|${season}`;
const byKeyOrder = (a: ReconciliationKey, b: ReconciliationKey): number =>
	a.userId.localeCompare(b.userId) || a.rankName.localeCompare(b.rankName) || a.season - b.season;

/** Pure diff between the ledger (plus achievement points) and `player_stats`, per (user, rank, season). */
export function buildReconciliationReport(input: ReconciliationInput): ReconciliationReport {
	const rankNameById = new Map(
		input.planResult.rankSummaries.map((summary) => [summary.rankId, summary.rankName]),
	);
	const ledgerByKey = aggregateLedgerEntries(input.planResult.entries, rankNameById);
	const achievementByKey = aggregateAchievementPoints(input.achievementPoints);

	// Rows of a hard-deleted user were never — and will never be — reconcilable
	// against a ledger the planner deliberately skipped writing; they are
	// surfaced separately (`orphanStatsOfMissingUsers`) rather than as noise
	// in `mismatches`/`orphanStatsCount`.
	const missingUserIds = new Set(input.planResult.skippedMissingUsers.users);
	const orphanStatsOfMissingUsers = input.playerStats.filter((row) =>
		missingUserIds.has(row.userId),
	).length;
	const statsByKey = new Map(
		input.playerStats
			.filter((row) => !missingUserIds.has(row.userId))
			.map((row) => [keyOf(row.userId, row.rankName, row.season), row]),
	);

	// Union of key sets: a player_stats row with zero ledger entries is a diff too.
	const allKeys = new Set([...ledgerByKey.keys(), ...statsByKey.keys()]);
	const mismatches = [...allKeys]
		.map((key) => {
			const ledger = ledgerByKey.get(key);
			const stats = statsByKey.get(key);
			return toMismatch(ledger ?? stats!, ledger, stats, achievementByKey.get(key) ?? 0);
		})
		.sort(byKeyOrder);
	const orphanStatsCount = [...statsByKey.keys()].filter((key) => !ledgerByKey.has(key)).length;

	const ledgerGameIds = new Set(input.planResult.entries.map((entry) => entry.gameId));
	// A game where every row belongs to a missing user never gets ledger rows
	// by design (skipped, not a data-quality problem) — it is not "incomplete".
	const skippedGameIds = new Set(input.planResult.skippedMissingUsers.gameIds);
	const incompleteGames = input.gameIds
		.filter((gameId) => !ledgerGameIds.has(gameId) && !skippedGameIds.has(gameId))
		.sort();

	const differingKeys = mismatches.filter((mismatch) => !isReconciled(mismatch)).length;
	const clean =
		differingKeys === 0 &&
		input.planResult.unmappedBanLists.length === 0 &&
		input.unmappedAchievementLabels.length === 0 &&
		incompleteGames.length === 0;

	return {
		mismatches,
		differingKeys,
		preFlaggedGames: {
			count: input.planResult.preFlaggedGameIds.length,
			gameIds: [...input.planResult.preFlaggedGameIds].sort(),
		},
		unmappedBanLists: input.planResult.unmappedBanLists,
		unmappedAchievementLabels: input.unmappedAchievementLabels,
		incompleteGames,
		orphanStatsCount,
		skippedMissingUsers: input.planResult.skippedMissingUsers,
		orphanStatsOfMissingUsers,
		clean,
	};
}

function isReconciled(mismatch: ReconciliationMismatch): boolean {
	return mismatch.deltaWins === 0 && mismatch.deltaLosses === 0 && mismatch.deltaPoints === 0;
}

function toMismatch(
	key: ReconciliationKey,
	ledger: LedgerAggregate | undefined,
	stats: PlayerStatsSnapshotRow | undefined,
	achievementPoints: number,
): ReconciliationMismatch {
	const ledgerWins = ledger?.wins ?? 0;
	const ledgerLosses = ledger?.losses ?? 0;
	const ledgerPoints = ledger?.points ?? 0;
	const statsWins = stats?.wins ?? 0;
	const statsLosses = stats?.losses ?? 0;
	const statsPoints = stats?.points ?? 0;

	return {
		userId: key.userId,
		rankName: key.rankName,
		season: key.season,
		ledgerWins,
		ledgerLosses,
		ledgerPoints,
		achievementPoints,
		statsWins,
		statsLosses,
		statsPoints,
		deltaWins: statsWins - ledgerWins,
		deltaLosses: statsLosses - ledgerLosses,
		deltaPoints: statsPoints - (ledgerPoints + achievementPoints),
	};
}

// Sums points for rows sharing a key — fan-out can feed the same group rank
// from more than one achievement label in the same season.
function aggregateAchievementPoints(rows: AchievementPointsRow[]): Map<string, number> {
	const byKey = new Map<string, number>();
	for (const row of rows) {
		const key = keyOf(row.userId, row.rankName, row.season);
		byKey.set(key, (byKey.get(key) ?? 0) + row.points);
	}

	return byKey;
}

function aggregateLedgerEntries(
	entries: PlanLedgerBackfillResult["entries"],
	rankNameById: Map<string, string>,
): Map<string, LedgerAggregate> {
	const byKey = new Map<string, LedgerAggregate>();
	for (const entry of entries) {
		const rankName = rankNameById.get(entry.rankId) ?? entry.rankId;
		const key = keyOf(entry.userId, rankName, entry.season);
		const acc = byKey.get(key) ?? {
			userId: entry.userId,
			rankName,
			season: entry.season,
			wins: 0,
			losses: 0,
			points: 0,
		};
		acc.wins += entry.winsDelta;
		acc.losses += entry.lossesDelta;
		acc.points += entry.pointsDelta;
		byKey.set(key, acc);
	}

	return byKey;
}
