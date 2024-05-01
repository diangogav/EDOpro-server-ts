import { BanList } from "../../../ban-list/domain/BanList";
import { Redis } from "../../../shared/db/redis/infrastructure/Redis";
import { GameOverData } from "../../domain/domain-events/GameOverDomainEvent";
import { RoomRepository } from "../../domain/RoomRepository";

export class RedisRoomRepository implements RoomRepository {
	async saveMatch(id: string, data: GameOverData): Promise<void> {
		const redis = Redis.getInstance();
		await redis.lpush(`user:${id}:duels`, JSON.stringify(data));
	}

	async updatePlayerPoints(id: string, points: number): Promise<void> {
		const redis = Redis.getInstance();
		await redis.zincrby("leaderboard:points", points, id);
	}

	async updatePlayerPointsByBanList(id: string, points: number, banList: BanList): Promise<void> {
		if (!banList.name) {
			return;
		}
		const redis = Redis.getInstance();
		await redis.zincrby(`leaderboard:${banList.name}:points`, points, id);
	}

	async increaseWins(id: string): Promise<void> {
		const redis = Redis.getInstance();
		await redis.zincrby("leaderboard:wins", 1, id);
	}

	async increaseLoses(id: string): Promise<void> {
		const redis = Redis.getInstance();
		await redis.zincrby("leaderboard:losses", 1, id);
	}

	async increaseWinsByBanList(id: string, banList: BanList): Promise<void> {
		if (!banList.name) {
			return;
		}
		const redis = Redis.getInstance();
		await redis.zincrby(`leaderboard:${banList.name}:wins`, 1, id);
	}

	async increaseLosesByBanList(id: string, banList: BanList): Promise<void> {
		if (!banList.name) {
			return;
		}
		const redis = Redis.getInstance();
		await redis.zincrby(`leaderboard:${banList.name}:losses`, 1, id);
	}
}
