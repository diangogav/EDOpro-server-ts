import { PlayerStats } from "./PlayerStats";

export interface PlayerStatsRepository {
	findByUserIdAndBanListName(userId: string, banListName: string): Promise<PlayerStats>;
	findTopBanListsByUserId(userId: string, limit: number): Promise<PlayerStats[]>;
	findGlobalRankPositionByUserId(userId: string): Promise<number>;
	save(playerStats: PlayerStats): Promise<void>;
}
