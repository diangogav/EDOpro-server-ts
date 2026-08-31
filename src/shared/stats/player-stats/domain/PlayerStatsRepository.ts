import { PlayerStats } from "./PlayerStats";

export interface PlayerStatsRepository {
	findByUserIdAndRankId(userId: string, rankId: string): Promise<PlayerStats>;
	save(playerStats: PlayerStats): Promise<void>;
}
