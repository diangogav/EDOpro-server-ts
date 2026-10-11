export type EvaluationInput = {
	rankedWinsBefore: number;
	rankedMatchesBefore: number;
	currentStreakBefore: number;
	ladderWinsBefore: number;
	/** Ladder the match was played in; null when it feeds no ladder. */
	ladder: string | null;
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
 * Every code the player qualifies for once this match is counted: totals that
 * reached or passed a threshold qualify, not only the exact transition into
 * it. A failed or interrupted award is therefore recovered by any later
 * evaluation, and callers award only the codes the player does not hold yet.
 */
export function evaluateAchievements(input: EvaluationInput): AwardCandidate[] {
	const codes: string[] = [];
	const winsAfter = input.rankedWinsBefore + (input.won ? 1 : 0);
	const streakAfter = input.won ? input.currentStreakBefore + 1 : 0;
	const matchesAfter = input.rankedMatchesBefore + 1;

	if (winsAfter >= 1) {
		codes.push("first_win");
	}
	for (const [threshold, code] of WIN_THRESHOLDS) {
		if (winsAfter >= threshold) {
			codes.push(code);
		}
	}
	for (const [threshold, code] of STREAK_THRESHOLDS) {
		if (streakAfter >= threshold) {
			codes.push(code);
		}
	}
	const ladderWinsAfter = input.ladderWinsBefore + (input.won ? 1 : 0);
	if (input.ladder !== null && ladderWinsAfter >= 1) {
		codes.push(formatFirstWinCode(input.ladder));
	}
	if (matchesAfter >= MATCHES_THRESHOLD) {
		codes.push("matches_100");
	}

	return codes.map((code) => ({ code }));
}
