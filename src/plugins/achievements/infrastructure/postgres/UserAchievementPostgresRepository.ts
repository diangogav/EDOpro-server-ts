import { EntityManager } from "typeorm";

import { dataSource } from "../../../../evolution-types/src/data-source";
import {
	AwardAchievement,
	UserAchievementRepository,
	UserAchievementTransaction,
} from "../../domain/UserAchievementRepository";

// One lock key per player, held until the surrounding transaction ends.
export const USER_ACHIEVEMENTS_LOCK_QUERY = `SELECT pg_advisory_xact_lock(hashtextextended('user_achievements:' || $1, 0))`;

class UserAchievementPostgresTransaction implements UserAchievementTransaction {
	constructor(private readonly manager: EntityManager) {}

	async heldAchievementIds(userId: string, achievementIds: number[]): Promise<Set<number>> {
		if (achievementIds.length === 0) {
			return new Set();
		}

		const rows: Array<{ achievement_id: number }> = await this.manager.query(
			`SELECT DISTINCT achievement_id FROM user_achievements WHERE user_id = $1 AND achievement_id = ANY($2)`,
			[userId, achievementIds],
		);

		return new Set(rows.map((row) => Number(row.achievement_id)));
	}

	async award({ userId, achievementId, season, labels }: AwardAchievement): Promise<void> {
		await this.manager.query(
			`INSERT INTO user_achievements (id, user_id, achievement_id, labels, unlocked_at, season)
			 VALUES (gen_random_uuid(), $1, $2, $3, now(), $4)`,
			[userId, achievementId, JSON.stringify(labels), season],
		);
	}
}

export class UserAchievementPostgresRepository implements UserAchievementRepository {
	transaction<T>(userId: string, work: (tx: UserAchievementTransaction) => Promise<T>): Promise<T> {
		return dataSource.transaction(async (manager) => {
			await manager.query(USER_ACHIEVEMENTS_LOCK_QUERY, [userId]);

			return work(new UserAchievementPostgresTransaction(manager));
		});
	}
}
