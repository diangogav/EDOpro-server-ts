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
	 * Plain insert: the table has no unique index over (user, achievement,
	 * season) because tournament trophies may legitimately repeat for a player.
	 * Gameplay rows are one-per-player only because the awarder checks
	 * `heldAchievementIds` before calling this.
	 */
	award(award: AwardAchievement): Promise<void>;
}
