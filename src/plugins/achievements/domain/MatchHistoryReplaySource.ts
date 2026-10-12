import { ReplayedMatch } from "./replayAchievements";

export interface MatchHistoryReplaySource {
	/** Ids of every user with at least one counted match. */
	userIdsWithMatches(): Promise<string[]>;

	/**
	 * The user's counted ranked matches, oldest first. "Counted" follows the
	 * same rule as `MatchHistoryReader`: annulled and soft-deleted rows are
	 * ignored. Ties on the timestamp fall back to creation time and id so the
	 * replay order is deterministic.
	 */
	historyFor(userId: string): Promise<ReplayedMatch[]>;
}
