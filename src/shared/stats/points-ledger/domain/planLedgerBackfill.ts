import { Rank } from "@shared/rank/domain/Rank";
import { PointsLedgerEntry } from "@shared/stats/player-stats/domain/PlayerStatsRepository";

const GLOBAL_RANK_NAME = "Global";
const NO_BAN_LIST_RANK_NAME = "N/A";

/** One historical `matches` row, per player per game, already excluding soft-deleted rows. */
export type BackfillMatchRow = {
	gameId: string;
	userId: string;
	season: number;
	banListName: string;
	winner: boolean;
	points: number;
	anulled: boolean;
};

export type ResolveAlias = (name: string) => string;
export type GroupsFor = (banListName: string) => string[];
/** Lookup-only: a name with no rank row must never be invented here. */
export type RanksByName = (name: string) => Rank | undefined;

export type UnmappedBanList = {
	banListName: string;
	matchRows: number;
};

export type RankBackfillSummary = {
	rankId: string;
	rankName: string;
	entryCount: number;
	gameCount: number;
	userCount: number;
};

export type PlanLedgerBackfillResult = {
	entries: PointsLedgerEntry[];
	unmappedBanLists: UnmappedBanList[];
	rankSummaries: RankBackfillSummary[];
	preFlaggedGameIds: string[];
};

type RankAccumulator = {
	rankName: string;
	entryCount: number;
	games: Set<string>;
	users: Set<string>;
};

/**
 * Pure re-derivation of the `applied` ledger rows live crediting would have
 * written for each historical match row, replaying `RankGroupResolver`'s
 * fan-out (banlist rank + Global + group ranks) with lookup-only rank
 * resolution — never `findOrCreateByName`, since inventing a rank during
 * backfill would fabricate a ladder that never existed at match time.
 */
export function planLedgerBackfill(
	matchRows: BackfillMatchRow[],
	resolveAlias: ResolveAlias,
	groupsFor: GroupsFor,
	ranksByName: RanksByName,
): PlanLedgerBackfillResult {
	const entries: PointsLedgerEntry[] = [];
	const unmappedCounts = new Map<string, number>();
	const preFlaggedGameIds = new Set<string>();
	const rankStats = new Map<string, RankAccumulator>();

	for (const row of matchRows) {
		if (row.anulled) {
			preFlaggedGameIds.add(row.gameId);
		}

		const credit = resolveRanksToCredit(row, resolveAlias, groupsFor, ranksByName);
		if (credit === null) {
			unmappedCounts.set(row.banListName, (unmappedCounts.get(row.banListName) ?? 0) + 1);
			continue;
		}

		const winsDelta = row.winner ? 1 : 0;
		const lossesDelta = row.winner ? 0 : 1;

		for (const rank of credit) {
			entries.push({
				gameId: row.gameId,
				userId: row.userId,
				rankId: rank.id,
				season: row.season,
				kind: "applied",
				cycle: 0,
				pointsDelta: row.points,
				winsDelta,
				lossesDelta,
			});
			accumulateRankStats(rankStats, rank, row);
		}
	}

	return {
		entries,
		unmappedBanLists: [...unmappedCounts.entries()]
			.map(([banListName, count]) => ({ banListName, matchRows: count }))
			.sort((a, b) => a.banListName.localeCompare(b.banListName)),
		rankSummaries: [...rankStats.entries()]
			.map(([rankId, stats]) => ({
				rankId,
				rankName: stats.rankName,
				entryCount: stats.entryCount,
				gameCount: stats.games.size,
				userCount: stats.users.size,
			}))
			.sort((a, b) => a.rankName.localeCompare(b.rankName) || a.rankId.localeCompare(b.rankId)),
		preFlaggedGameIds: [...preFlaggedGameIds].sort(),
	};
}

// Returns null when any rank this row would credit cannot be resolved — the
// whole row is then reported as unmapped instead of applying a partial fan-out.
function resolveRanksToCredit(
	row: BackfillMatchRow,
	resolveAlias: ResolveAlias,
	groupsFor: GroupsFor,
	ranksByName: RanksByName,
): Rank[] | null {
	const hasBanList = Boolean(row.banListName);
	const isRankedBanList = hasBanList && row.banListName !== NO_BAN_LIST_RANK_NAME;
	const resolvedBanListName = isRankedBanList ? resolveAlias(row.banListName) : row.banListName;

	const ranks: Rank[] = [];

	if (hasBanList) {
		const banListRank = ranksByName(resolvedBanListName);
		if (!banListRank) {
			return null;
		}
		ranks.push(banListRank);
	}

	const globalRank = ranksByName(GLOBAL_RANK_NAME);
	if (!globalRank) {
		return null;
	}
	ranks.push(globalRank);

	if (isRankedBanList) {
		for (const groupName of groupsFor(resolvedBanListName)) {
			const groupRank = ranksByName(groupName);
			if (!groupRank) {
				return null;
			}
			ranks.push(groupRank);
		}
	}

	return ranks;
}

function accumulateRankStats(
	rankStats: Map<string, RankAccumulator>,
	rank: Rank,
	row: BackfillMatchRow,
): void {
	const stats = rankStats.get(rank.id) ?? {
		rankName: rank.name,
		entryCount: 0,
		games: new Set<string>(),
		users: new Set<string>(),
	};
	stats.entryCount += 1;
	stats.games.add(row.gameId);
	stats.users.add(row.userId);
	rankStats.set(rank.id, stats);
}
