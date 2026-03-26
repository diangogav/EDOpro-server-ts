import { dataSource } from "../../../../evolution-types/src/data-source";
import { PlayerStatsEntity } from "../../../../evolution-types/src/entities/PlayerStatsEntity";
import { PlayerStats } from "../domain/PlayerStats";
import { PlayerStatsRepository } from "../domain/PlayerStatsRepository";
import { config } from "./../../../../config/index";
import { MoreThan } from "typeorm";

export class PlayerStatsPostgresRepository implements PlayerStatsRepository {
	async findByUserIdAndBanListName(userId: string, banListName: string): Promise<PlayerStats> {
		const repository = dataSource.getRepository(PlayerStatsEntity);
		const playerStatsResponse = await repository.findOneBy({
			banListName,
			userId,
			season: config.season,
		});
		if (!playerStatsResponse) {
			return PlayerStats.initialize({
				banListName,
				userId,
				season: config.season,
			});
		}

		return PlayerStats.from(playerStatsResponse);
	}

	async findTopBanListsByUserId(userId: string, limit: number): Promise<PlayerStats[]> {
		const repository = dataSource.getRepository(PlayerStatsEntity);
		const playerStatsResponses = await repository.find({
			where: {
				userId,
				season: config.season,
				points: MoreThan(0),
			},
			order: {
				points: "DESC",
			},
			take: limit,
		});

		return playerStatsResponses.slice(0, limit).map((item) => PlayerStats.from(item));
	}

	async findGlobalRankPositionByUserId(userId: string): Promise<number> {
		const repository = dataSource.getRepository(PlayerStatsEntity);
		const globalStats = await this.findByUserIdAndBanListName(userId, "Global");
		const betterPlayers = await repository.count({
			where: {
				banListName: "Global",
				season: config.season,
				points: MoreThan(globalStats.points),
			},
		});

		return betterPlayers + 1;
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
			season: config.season,
		});

		await repository.save(playerStatsEntity);
	}
}
