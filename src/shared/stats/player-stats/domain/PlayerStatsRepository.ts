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

export type LedgerEntriesInsertProgress = {
	chunkIndex: number;
	totalChunks: number;
	chunkSize: number;
	insertedInChunk: number;
	skippedInChunk: number;
	totalInserted: number;
	totalSkipped: number;
};

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

	/**
	 * Bulk-inserts ledger rows with multi-row `INSERT ... VALUES
	 * (...),(...) ON CONFLICT DO NOTHING` statements, chunked at 1,000 rows
	 * per statement (well under Postgres' 65,535 bind-parameter limit) and
	 * issued sequentially so a large backfill does not flood the
	 * connection. `onChunkComplete`, when given, fires after each statement
	 * so a long-running caller can log progress. An empty `entries` list
	 * issues no query.
	 */
	insertLedgerEntries(
		entries: PointsLedgerEntry[],
		onChunkComplete?: (progress: LedgerEntriesInsertProgress) => void,
	): Promise<{ inserted: number; skipped: number }>;
}
