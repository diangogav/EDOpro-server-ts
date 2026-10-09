import { dataSource } from "../../../../evolution-types/src/data-source";
import {
	AwardAchievement,
	UserAchievementRepository,
} from "../../domain/UserAchievementRepository";

export class UserAchievementPostgresRepository implements UserAchievementRepository {
	async award({ userId, achievementId, season, labels }: AwardAchievement): Promise<boolean> {
		const rows: unknown[] = await dataSource.query(
			`INSERT INTO user_achievements (id, user_id, achievement_id, labels, unlocked_at, season)
			 VALUES (gen_random_uuid(), $1, $2, $3, now(), $4)
			 ON CONFLICT (user_id, achievement_id, season) DO NOTHING
			 RETURNING id`,
			[userId, achievementId, JSON.stringify(labels), season],
		);

		return rows.length > 0;
	}
}
