import { dataSource } from "../../../../evolution-types/src/data-source";
import { MatchHistoryReplaySource } from "../../domain/MatchHistoryReplaySource";
import { ReplayedMatch } from "../../domain/replayAchievements";

// Same counting rule as MatchHistoryPostgresReader: not annulled, not
// soft-deleted.
const COUNTED = `anulled = false AND deleted_at IS NULL`;

export class MatchHistoryReplayPostgresSource implements MatchHistoryReplaySource {
	async userIdsWithMatches(): Promise<string[]> {
		const rows: Array<{ user_id: string }> = await dataSource.query(
			`SELECT DISTINCT user_id FROM matches WHERE ${COUNTED}`,
		);

		return rows.map((row) => row.user_id);
	}

	async historyFor(userId: string): Promise<ReplayedMatch[]> {
		const rows: Array<{ winner: boolean; ban_list_name: string; season: number }> =
			await dataSource.query(
				`SELECT winner, ban_list_name, season FROM matches
				 WHERE user_id = $1 AND ${COUNTED}
				 ORDER BY date ASC, created_at ASC, id ASC`,
				[userId],
			);

		return rows.map((row) => ({
			won: row.winner,
			banListName: row.ban_list_name,
			season: row.season,
		}));
	}
}
