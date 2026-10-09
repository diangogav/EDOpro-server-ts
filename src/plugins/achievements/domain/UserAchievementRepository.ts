export type AwardAchievement = {
	userId: string;
	achievementId: number;
	season: number;
	labels: string[];
};

export interface UserAchievementRepository {
	/**
	 * Idempotent: awarding the same (user, achievement, season) twice leaves a
	 * single row. Resolves true when this call created the row, false when it
	 * already existed.
	 */
	award(award: AwardAchievement): Promise<boolean>;
}
