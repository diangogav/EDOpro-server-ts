export type MatchHistorySummary = {
	rankedWins: number;
	rankedMatches: number;
	currentStreak: number;
	/** Wins keyed by the ban list name stored on the match row. */
	ladderWins: Record<string, number>;
};

export interface MatchHistoryReader {
	/**
	 * Ranked history of a user read from the `matches` table, which only holds
	 * ranked matches (the basic-stats plugin persists nothing for unranked
	 * ones). Annulled and soft-deleted rows are ignored.
	 *
	 * Counts are all-time, not per season: the achievements are lifetime
	 * milestones, while the season only scopes the awarded row. A match row
	 * carries its season and the ban list it was played under, but neither
	 * narrows the totals. `ladderWins` is keyed by the stored ban list name,
	 * so the caller folds those names into ladders.
	 *
	 * `excludeMatchId` removes the match being evaluated, so the summary never
	 * depends on whether that match's row was already written. The streak is
	 * the number of consecutive wins ending at the most recent match.
	 */
	summaryFor(userId: string, options: { excludeMatchId: string }): Promise<MatchHistorySummary>;
}
