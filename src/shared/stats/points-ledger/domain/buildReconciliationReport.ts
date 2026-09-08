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
	mismatches: ReconciliationMismatch[];
	preFlaggedGames: { count: number; gameIds: string[] };
	unmappedBanLists: PlanLedgerBackfillResult["unmappedBanLists"];
	incompleteGames: string[];
	/** Count of `mismatches` rows for a player_stats key with zero ledger entries. */
	orphanStatsCount: number;
	clean: boolean;
};

export type ReconciliationInput = {
	planResult: PlanLedgerBackfillResult;
	gameIds: string[];
	playerStats: PlayerStatsSnapshotRow[];
	achievementPoints: AchievementPointsRow[];
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
	const achievementByKey = new Map(
		input.achievementPoints.map((row) => [keyOf(row.userId, row.rankName, row.season), row.points]),
	);
	const statsByKey = new Map(
		input.playerStats.map((row) => [keyOf(row.userId, row.rankName, row.season), row]),
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
	const incompleteGames = input.gameIds.filter((gameId) => !ledgerGameIds.has(gameId)).sort();

	const clean =
		mismatches.every(isReconciled) &&
		input.planResult.unmappedBanLists.length === 0 &&
		incompleteGames.length === 0;

	return {
		mismatches,
		preFlaggedGames: {
			count: input.planResult.preFlaggedGameIds.length,
			gameIds: [...input.planResult.preFlaggedGameIds].sort(),
		},
		unmappedBanLists: input.planResult.unmappedBanLists,
		incompleteGames,
		orphanStatsCount,
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
