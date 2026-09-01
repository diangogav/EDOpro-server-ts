import { Rating } from "./Rating";

export type RatingHistoryEntry = {
	matchId: string;
	userId: string;
	rankId: string;
	season: number;
	kind: "applied" | "reversal";
	previousRating: number;
	delta: number;
	kFactor: number;
	opponentRating: number;
};

/**
 * Write-side handle bound to one open transaction. All operations happen
 * against the row-locked ratings acquired by `RatingRepository.transaction`.
 */
export interface RatingTransaction {
	/**
	 * Inserts one rating_history row. Returns false instead of throwing when
	 * the row already exists for (matchId, userId, kind, rankId) — the UNIQUE
	 * constraint makes a replayed write a no-op the caller can detect and
	 * skip projecting. It is scoped per rank, so the several ladders one match
	 * feeds each get their own row.
	 */
	insertHistory(entry: RatingHistoryEntry): Promise<boolean>;

	/** Upserts the derived player_ratings projection for one player. */
	saveRating(userId: string, rankId: string, season: number, rating: Rating): Promise<void>;
}

export interface RatingRepository {
	/**
	 * Locks every `player_ratings` row for the given users (ordered by
	 * user_id ascending to avoid lock-order deadlocks between concurrent
	 * matches sharing a player), defaulting missing rows to a fresh
	 * season-start rating, then runs `work` inside that same transaction.
	 */
	transaction<T>(
		userIds: string[],
		rankId: string,
		season: number,
		work: (ratings: Map<string, Rating>, tx: RatingTransaction) => Promise<T>,
	): Promise<T>;

	/**
	 * Reads current ratings for the given users without acquiring any row
	 * lock, defaulting missing rows to a fresh season-start rating. Read-only
	 * display path — must never interfere with `transaction`'s write-side
	 * locking.
	 */
	findMany(userIds: string[], rankId: string, season: number): Promise<Map<string, Rating>>;
}
