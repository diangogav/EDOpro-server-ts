import { PlayerStats } from "../domain/PlayerStats";
import { PlayerStatsRepository } from "../domain/PlayerStatsRepository";

export class PlayerStatsPostgresRepository implements PlayerStatsRepository {
	async findByUserIdAndBanListName(userId: string, banListName: string): Promise<PlayerStats> {
		return Promise.resolve(
			PlayerStats.initialize({ id: "589437859734897543user", userId, banListName })
		);
	}
}
