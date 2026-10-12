import { evaluateAchievements, formatFirstWinCode } from "./evaluateAchievements";

export type ReplayedMatch = {
	won: boolean;
	banListName: string;
	season: number;
};

export type ReplayedAchievement = {
	code: string;
	/** Season of the first match that reached the code. */
	season: number;
	labels: string[];
};

/**
 * Folds a user's counted ranked matches, oldest first, through the same
 * evaluator the live awarder uses, so the result is what the awarder would
 * have granted had it existed from the first match. Each code keeps the
 * season of the match that first reached it.
 */
export function replayAchievements(
	matches: ReplayedMatch[],
	laddersFor: (banListName: string) => string[],
): ReplayedAchievement[] {
	const awarded = new Map<string, ReplayedAchievement>();
	const ladderWins = new Map<string, number>();
	let rankedWins = 0;
	let rankedMatches = 0;
	let currentStreak = 0;

	for (const match of matches) {
		const ladders = laddersFor(match.banListName);
		const evaluations =
			ladders.length === 0
				? [{ ladder: null, ladderWinsBefore: 0 }]
				: ladders.map((ladder) => ({ ladder, ladderWinsBefore: ladderWins.get(ladder) ?? 0 }));

		for (const { ladder, ladderWinsBefore } of evaluations) {
			const candidates = evaluateAchievements({
				rankedWinsBefore: rankedWins,
				rankedMatchesBefore: rankedMatches,
				currentStreakBefore: currentStreak,
				ladderWinsBefore,
				ladder,
				won: match.won,
			});
			for (const { code } of candidates) {
				if (!awarded.has(code)) {
					awarded.set(code, {
						code,
						season: match.season,
						labels: ladder !== null && code === formatFirstWinCode(ladder) ? [ladder] : [],
					});
				}
			}
		}

		rankedMatches += 1;
		currentStreak = match.won ? currentStreak + 1 : 0;
		if (match.won) {
			rankedWins += 1;
			for (const ladder of ladders) {
				ladderWins.set(ladder, (ladderWins.get(ladder) ?? 0) + 1);
			}
		}
	}

	return [...awarded.values()];
}
