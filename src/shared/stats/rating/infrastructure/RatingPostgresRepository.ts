import { EntityManager } from "typeorm";

import { Rating } from "../domain/Rating";
import {
	RatingHistoryEntry,
	RatingRepository,
	RatingTransaction,
} from "../domain/RatingRepository";
import { dataSource } from "../../../../evolution-types/src/data-source";

// Encodes (user_id, rank_id, season) with a length-prefixed field so
// the concatenation stays injective even when a value contains the
// delimiter — a plain "a|b|c" join can collide for two different inputs.
const ADVISORY_LOCK_QUERY = `
	SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || length($2)::text || ':' || $2 || ':' || $3, 0))
`;

const LOCK_RATINGS_QUERY = `
	SELECT user_id AS "userId", rating, games_played AS "gamesPlayed", peak
	FROM player_ratings
	WHERE rank_id = $1 AND season = $2 AND user_id = ANY($3)
	ORDER BY user_id ASC
	FOR UPDATE
`;

// Same shape as LOCK_RATINGS_QUERY minus FOR UPDATE: a display-only read must
// never take a row lock or otherwise interfere with the write path above.
const FIND_RATINGS_QUERY = `
	SELECT user_id AS "userId", rating, games_played AS "gamesPlayed", peak
	FROM player_ratings
	WHERE rank_id = $1 AND season = $2 AND user_id = ANY($3)
	ORDER BY user_id ASC
`;

const INSERT_HISTORY_QUERY = `
	INSERT INTO rating_history (match_id, user_id, rank_id, season, kind, previous_rating, delta, k_factor, opponent_rating)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT (match_id, user_id, kind) DO NOTHING
	RETURNING id
`;

const UPSERT_RATING_QUERY = `
	INSERT INTO player_ratings (user_id, rank_id, season, rating, games_played, peak)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (user_id, rank_id, season)
	DO UPDATE SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, peak = EXCLUDED.peak, updated_at = now()
`;

type PlayerRatingRow = { userId: string; rating: number; gamesPlayed: number; peak: number };

export class RatingPostgresRepository implements RatingRepository {
	async transaction<T>(
		userIds: string[],
		rankId: string,
		season: number,
		work: (ratings: Map<string, Rating>, tx: RatingTransaction) => Promise<T>,
	): Promise<T> {
		return dataSource.transaction(async (manager) => {
			const orderedIds = [...userIds].sort();

			await this.acquireParticipantLocks(manager, orderedIds, rankId, season);
			const ratings = await this.lockRatings(manager, orderedIds, rankId, season);
			const tx = new RatingPostgresTransaction(manager);

			return work(ratings, tx);
		});
	}

	// SELECT ... FOR UPDATE cannot lock a row that does not exist yet: for a
	// player's first rated match in a (rank, season), two concurrent
	// GAME_OVER transactions can both see "no row", both default to
	// Rating.initialize(), and the later UPSERT overwrites the earlier one —
	// the projection drops a match while rating_history keeps both. A
	// session-scoped advisory lock per participant, acquired sequentially in
	// the same sorted order used below for the row lock, closes that window
	// before either transaction reads anything and keeps the lock order
	// consistent across matches that share a player, avoiding deadlocks.
	private async acquireParticipantLocks(
		manager: EntityManager,
		orderedIds: string[],
		rankId: string,
		season: number,
	): Promise<void> {
		for (const userId of orderedIds) {
			await manager.query(ADVISORY_LOCK_QUERY, [userId, rankId, season]);
		}
	}

	private async lockRatings(
		manager: EntityManager,
		orderedIds: string[],
		rankId: string,
		season: number,
	): Promise<Map<string, Rating>> {
		const rows: PlayerRatingRow[] = await manager.query(LOCK_RATINGS_QUERY, [
			rankId,
			season,
			orderedIds,
		]);

		return toRatingsMap(orderedIds, rows);
	}

	async findMany(userIds: string[], rankId: string, season: number): Promise<Map<string, Rating>> {
		const rows: PlayerRatingRow[] = await dataSource.query(FIND_RATINGS_QUERY, [
			rankId,
			season,
			userIds,
		]);

		return toRatingsMap(userIds, rows);
	}
}

function toRatingsMap(userIds: string[], rows: PlayerRatingRow[]): Map<string, Rating> {
	const ratings = new Map<string, Rating>();
	for (const userId of userIds) {
		const row = rows.find((item) => item.userId === userId);
		ratings.set(
			userId,
			row
				? Rating.from({ value: row.rating, gamesPlayed: row.gamesPlayed, peak: row.peak })
				: Rating.initialize(),
		);
	}

	return ratings;
}

class RatingPostgresTransaction implements RatingTransaction {
	constructor(private readonly manager: EntityManager) {}

	async insertHistory(entry: RatingHistoryEntry): Promise<boolean> {
		const rows = await this.manager.query(INSERT_HISTORY_QUERY, [
			entry.matchId,
			entry.userId,
			entry.rankId,
			entry.season,
			entry.kind,
			entry.previousRating,
			entry.delta,
			entry.kFactor,
			entry.opponentRating,
		]);

		return rows.length > 0;
	}

	async saveRating(userId: string, rankId: string, season: number, rating: Rating): Promise<void> {
		await this.manager.query(UPSERT_RATING_QUERY, [
			userId,
			rankId,
			season,
			rating.value,
			rating.gamesPlayed,
			rating.peak,
		]);
	}
}
