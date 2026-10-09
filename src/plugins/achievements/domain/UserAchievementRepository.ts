export type AwardAchievement = {
	userId: string;
	achievementId: number;
	season: number;
	labels: string[];
};

export interface UserAchievementRepository {
	/**
	 * Ids among `achievementIds` the user already holds in any season. Gameplay
	 * achievements are awarded once per player, ever; the season-scoped unique
	 * index alone would let them recur in a later season.
	 */
	heldAchievementIds(userId: string, achievementIds: number[]): Promise<Set<number>>;

	/**
	 * Idempotent: awarding the same (user, achievement, season) twice leaves a
	 * single row. Resolves true when this call created the row, false when it
	 * already existed.
	 */
	award(award: AwardAchievement): Promise<boolean>;
}
