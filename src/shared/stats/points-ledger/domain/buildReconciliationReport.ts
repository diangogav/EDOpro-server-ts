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

	const mismatches = [...ledgerByKey.values()]
		.map((ledger) =>
			toMismatch(
				ledger,
				statsByKey.get(keyOf(ledger.userId, ledger.rankName, ledger.season)),
				achievementByKey.get(keyOf(ledger.userId, ledger.rankName, ledger.season)) ?? 0,
			),
		)
		.sort(byKeyOrder);

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
		clean,
	};
}

function isReconciled(mismatch: ReconciliationMismatch): boolean {
	return mismatch.deltaWins === 0 && mismatch.deltaLosses === 0 && mismatch.deltaPoints === 0;
}

function toMismatch(
	ledger: LedgerAggregate,
	stats: PlayerStatsSnapshotRow | undefined,
	achievementPoints: number,
): ReconciliationMismatch {
	const statsWins = stats?.wins ?? 0;
	const statsLosses = stats?.losses ?? 0;
	const statsPoints = stats?.points ?? 0;

	return {
		userId: ledger.userId,
		rankName: ledger.rankName,
		season: ledger.season,
		ledgerWins: ledger.wins,
		ledgerLosses: ledger.losses,
		ledgerPoints: ledger.points,
		achievementPoints,
		statsWins,
		statsLosses,
		statsPoints,
		deltaWins: statsWins - ledger.wins,
		deltaLosses: statsLosses - ledger.losses,
		deltaPoints: statsPoints - (ledger.points + achievementPoints),
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
