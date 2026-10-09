import { dataSource } from "../../../../evolution-types/src/data-source";
import { MatchHistoryReader, MatchHistorySummary } from "../../domain/MatchHistoryReader";

// Rows that count as history: not annulled, not soft-deleted, not the match
// being evaluated.
const COUNTED = `user_id = $1 AND anulled = false AND deleted_at IS NULL AND game_id <> $2`;

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

		// Streak: counted matches with no counted loss at the same time or later,
		// i.e. the run of wins ending at the most recent match.
		const [streak]: Array<{ streak: string }> = await dataSource.query(
			`SELECT count(*) AS streak FROM matches m
			 WHERE m.user_id = $1 AND m.anulled = false AND m.deleted_at IS NULL AND m.game_id <> $2
			   AND NOT EXISTS (
			     SELECT 1 FROM matches l
			     WHERE l.user_id = m.user_id AND l.anulled = false AND l.deleted_at IS NULL
			       AND l.game_id <> $2 AND l.winner = false AND l.date >= m.date)`,
			params,
		);

		return {
			rankedMatches: Number(totals.matches),
			rankedWins: Number(totals.wins),
			currentStreak: Number(streak.streak),
			ladderWins: Object.fromEntries(
				ladderRows.map((row) => [row.ban_list_name, Number(row.wins)]),
			),
		};
	}
}
