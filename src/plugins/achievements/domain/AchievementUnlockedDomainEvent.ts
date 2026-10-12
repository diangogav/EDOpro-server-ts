export type AchievementUnlockedData = {
	userId: string;
	username: string;
	achievementId: number;
	/** Catalog code of the achievement, e.g. `first_win` or `format_first_win:TCG`. */
	code: string;
	season: number;
	/** Qualifiers of the unlock, such as the ladder a format achievement belongs to. */
	labels: string[];
	/** Match whose result unlocked the achievement. */
	matchId: string;
	roomId: number;
};

export class AchievementUnlockedDomainEvent {
	static readonly DOMAIN_EVENT = "ACHIEVEMENT_UNLOCKED";
	readonly data: AchievementUnlockedData;

	constructor(data: AchievementUnlockedData) {
		this.data = data;
	}
}
