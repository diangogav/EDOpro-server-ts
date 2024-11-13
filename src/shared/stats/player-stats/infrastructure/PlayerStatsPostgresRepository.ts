import { dataSource } from "../../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../../evolution-types/src/entities/PlayerStatsEntity";
import { PlayerStats } from "../domain/PlayerStats";
import { PlayerStatsRepository } from "../domain/PlayerStatsRepository";
import { config } from "./../../../../config/index";

export class PlayerStatsPostgresRepository implements PlayerStatsRepository {
	async findByUserIdAndBanListName(userId: string, banListName: string): Promise<PlayerStats> {
		const repository = dataSource.getRepository(PlayerStatsEntity);
		const playerStatsResponse = await repository.findOneBy({ banListName, userId });
		if (!playerStatsResponse) {
			return PlayerStats.initialize({
				banListName,
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
			banListName: playerStats.banListName,
			wins: playerStats.wins,
			losses: playerStats.losses,
			points: playerStats.points,
			userId: playerStats.userId,
		});

		await repository.save(playerStatsEntity);
	}
}
