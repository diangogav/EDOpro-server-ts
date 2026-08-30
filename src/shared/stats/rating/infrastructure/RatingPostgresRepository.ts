import { EntityManager } from "typeorm";

import { Rating } from "../domain/Rating";
import {
	RatingHistoryEntry,
	RatingRepository,
	RatingTransaction,
} from "../domain/RatingRepository";
import { dataSource } from "../../../../evolution-types/src/data-source";

const LOCK_RATINGS_QUERY = `
	SELECT user_id AS "userId", rating, games_played AS "gamesPlayed", peak
	FROM player_ratings
	WHERE ban_list_name = $1 AND season = $2 AND user_id = ANY($3)
	ORDER BY user_id ASC
	FOR UPDATE
`;

const INSERT_HISTORY_QUERY = `
	INSERT INTO rating_history (match_id, user_id, ban_list_name, season, kind, previous_rating, delta, k_factor, opponent_rating)
	VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	ON CONFLICT (match_id, user_id, kind) DO NOTHING
	RETURNING id
`;

const UPSERT_RATING_QUERY = `
	INSERT INTO player_ratings (user_id, ban_list_name, season, rating, games_played, peak)
	VALUES ($1, $2, $3, $4, $5, $6)
	ON CONFLICT (user_id, ban_list_name, season)
	DO UPDATE SET rating = EXCLUDED.rating, games_played = EXCLUDED.games_played, peak = EXCLUDED.peak, updated_at = now()
`;

type PlayerRatingRow = { userId: string; rating: number; gamesPlayed: number; peak: number };

export class RatingPostgresRepository implements RatingRepository {
	async transaction<T>(
		userIds: string[],
		banListName: string,
		season: number,
		work: (ratings: Map<string, Rating>, tx: RatingTransaction) => Promise<T>,
	): Promise<T> {
		return dataSource.transaction(async (manager) => {
			const ratings = await this.lockRatings(manager, userIds, banListName, season);
			const tx = new RatingPostgresTransaction(manager);

			return work(ratings, tx);
		});
	}

	private async lockRatings(
		manager: EntityManager,
		userIds: string[],
		banListName: string,
		season: number,
	): Promise<Map<string, Rating>> {
		const orderedIds = [...userIds].sort();
		const rows: PlayerRatingRow[] = await manager.query(LOCK_RATINGS_QUERY, [
			banListName,
			season,
			orderedIds,
		]);

		const ratings = new Map<string, Rating>();
		for (const userId of orderedIds) {
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
}

class RatingPostgresTransaction implements RatingTransaction {
	constructor(private readonly manager: EntityManager) {}

	async insertHistory(entry: RatingHistoryEntry): Promise<boolean> {
		const rows = await this.manager.query(INSERT_HISTORY_QUERY, [
			entry.matchId,
			entry.userId,
			entry.banListName,
			entry.season,
			entry.kind,
			entry.previousRating,
			entry.delta,
			entry.kFactor,
			entry.opponentRating,
		]);

		return rows.length > 0;
	}

	async saveRating(
		userId: string,
		banListName: string,
		season: number,
		rating: Rating,
	): Promise<void> {
		await this.manager.query(UPSERT_RATING_QUERY, [
			userId,
			banListName,
			season,
			rating.value,
			rating.gamesPlayed,
			rating.peak,
		]);
	}
}
