import { dataSource } from "../../../../evolution-types/src/data-source";
import { currentStreak } from "../../domain/currentStreak";
import { MatchHistoryReader, MatchHistorySummary } from "../../domain/MatchHistoryReader";

// Rows that count as history: not annulled, not soft-deleted, not the match
// being evaluated.
const COUNTED = `user_id = $1 AND anulled = false AND deleted_at IS NULL AND game_id <> $2`;

const STREAK_WINDOW = 200;

export class MatchHistoryPostgresReader implements MatchHistoryReader {
	async summaryFor(
		userId: string,
		{ excludeMatchId }: { excludeMatchId: string },
	): Promise<MatchHistorySummary> {
		const params = [userId, excludeMatchId];

		const [totals]: Array<{ matches: string; wins: string }> = await dataSource.query(
			`SELECT count(*) AS matches, count(*) FILTER (WHERE winner) AS wins
			 FROM matches WHERE ${COUNTED}`,
			params,
		);

		const ladderRows: Array<{ ban_list_name: string; wins: string }> = await dataSource.query(
			`SELECT ban_list_name, count(*) AS wins
			 FROM matches WHERE ${COUNTED} AND winner = true
			 GROUP BY ban_list_name`,
			params,
		);

		// Latest outcomes first; ties on the timestamp fall back to creation
		// time and id so the order is deterministic. Streak thresholds are far
		// below the limit.
		const outcomes: Array<{ winner: boolean }> = await dataSource.query(
			`SELECT winner FROM matches WHERE ${COUNTED}
			 ORDER BY date DESC, created_at DESC, id DESC LIMIT ${STREAK_WINDOW}`,
			params,
		);

		return {
			rankedMatches: Number(totals.matches),
			rankedWins: Number(totals.wins),
			currentStreak: currentStreak(outcomes.map((row) => row.winner)),
			ladderWins: Object.fromEntries(
				ladderRows.map((row) => [row.ban_list_name, Number(row.wins)]),
			),
		};
	}
}
