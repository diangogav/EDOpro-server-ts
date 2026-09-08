import { PlayerStats } from "./PlayerStats";

export type PointsLedgerEntry = {
	gameId: string;
	userId: string;
	rankId: string;
	season: number;
	kind: "applied" | "reversal" | "reinstatement";
	cycle: number;
	pointsDelta: number;
	winsDelta: number;
	lossesDelta: number;
};

/**
 * Write-side handle bound to one open transaction, scoped to a single
 * (userId, season) pair across the locked ranks. All operations happen
 * against the ladder locks acquired by `PlayerStatsRepository.transaction`.
 */
export interface PlayerStatsTransaction {
	findByUserIdAndRankId(userId: string, rankId: string): Promise<PlayerStats>;
	save(playerStats: PlayerStats): Promise<void>;

	/**
	 * Inserts one points_ledger row. Returns false instead of throwing when
	 * the row already exists for (gameId, userId, rankId, kind, cycle) — the
	 * UNIQUE constraint makes a replayed write a no-op the caller can detect
	 * and skip re-projecting.
	 */
	insertLedgerEntry(entry: PointsLedgerEntry): Promise<boolean>;
}

export interface PlayerStatsRepository {
	findByUserIdAndRankId(userId: string, rankId: string): Promise<PlayerStats>;
	save(playerStats: PlayerStats): Promise<void>;

	/**
	 * Acquires one advisory lock per rank in `rankIds` (sorted ascending, to
	 * avoid lock-order deadlocks between concurrent matches sharing a
	 * player), then runs `work` inside that same transaction.
	 */
	transaction<T>(
		userId: string,
		rankIds: string[],
		season: number,
		work: (tx: PlayerStatsTransaction) => Promise<T>,
	): Promise<T>;
}
