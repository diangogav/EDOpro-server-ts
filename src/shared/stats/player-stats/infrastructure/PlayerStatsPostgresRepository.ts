import { dataSource } from "../../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../../evolution-types/src/entities/PlayerStatsEntity";
import { PlayerStats } from "../domain/PlayerStats";
import { PlayerStatsRepository } from "../domain/PlayerStatsRepository";
import { config } from "./../../../../config/index";

export class PlayerStatsPostgresRepository implements PlayerStatsRepository {
	async findByUserIdAndRankId(userId: string, rankId: string): Promise<PlayerStats> {
		const repository = dataSource.getRepository(PlayerStatsEntity);
		const playerStatsResponse = await repository.findOneBy({
			rankId,
			userId,
			season: config.season,
		});
		if (!playerStatsResponse) {
			return PlayerStats.initialize({
				rankId,
				userId,
				season: config.season,
			});
		}

		return PlayerStats.from(playerStatsResponse);
	}

	async save(playerStats: PlayerStats): Promise<void> {
		const repository = dataSource.getRepository(PlayerStatsEntity);

		const playerStatsEntity = repository.create({
			id: playerStats.id,
			rankId: playerStats.rankId,
			wins: playerStats.wins,
			losses: playerStats.losses,
			points: playerStats.points,
			userId: playerStats.userId,
			season: config.season,
		});

		await repository.save(playerStatsEntity);
	}
}
