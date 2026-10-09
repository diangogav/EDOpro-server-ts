export type EvaluationInput = {
	rankedWinsBefore: number;
	rankedMatchesBefore: number;
	currentStreakBefore: number;
	ladderWinsBefore: number;
	ladder: string;
	won: boolean;
};

export type AwardCandidate = {
	code: string;
};

const WIN_THRESHOLDS: Array<[number, string]> = [
	[10, "wins_10"],
	[50, "wins_50"],
	[100, "wins_100"],
];

const STREAK_THRESHOLDS: Array<[number, string]> = [
	[3, "streak_3"],
	[5, "streak_5"],
	[10, "streak_10"],
];

const MATCHES_THRESHOLD = 100;

export const formatFirstWinCode = (ladder: string): string => `format_first_win:${ladder}`;

/**
 * Codes newly reached by the match that just ended. Each rule fires only on
 * the exact transition into its threshold, so replaying the same history never
 * yields a code twice; the unique index on user_achievements is the second
 * guard.
 */
export function evaluateAchievements(input: EvaluationInput): AwardCandidate[] {
	const codes: string[] = [];

	if (input.won) {
		const winsAfter = input.rankedWinsBefore + 1;
		if (winsAfter === 1) {
			codes.push("first_win");
		}
		for (const [threshold, code] of WIN_THRESHOLDS) {
			if (winsAfter === threshold) {
				codes.push(code);
			}
		}

		const streakAfter = input.currentStreakBefore + 1;
		for (const [threshold, code] of STREAK_THRESHOLDS) {
			if (streakAfter === threshold) {
				codes.push(code);
			}
		}

		if (input.ladderWinsBefore === 0) {
			codes.push(formatFirstWinCode(input.ladder));
		}
	}

	if (input.rankedMatchesBefore + 1 === MATCHES_THRESHOLD) {
		codes.push("matches_100");
	}

	return codes.map((code) => ({ code }));
}
