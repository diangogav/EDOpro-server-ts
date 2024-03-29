import { BanList } from "../../../ban-list/domain/BanList";
import { Redis } from "../../../shared/db/redis/infrastructure/Redis";
import { GameOverData } from "../../domain/domain-events/GameOverDomainEvent";
import { RoomRepository } from "../../domain/RoomRepository";

export class RedisRoomRepository implements RoomRepository {
	async saveMatch(id: string, data: GameOverData): Promise<void> {
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.lPush(`user:${id}:duels`, JSON.stringify(data));
		await redis.client.quit();
	}

	async updatePlayerPoints(id: string, points: number): Promise<void> {
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.zIncrBy("leaderboard:points", points, id);
		await redis.client.quit();
	}

	async updatePlayerPointsByBanList(id: string, points: number, banList: BanList): Promise<void> {
		if (!banList.name) {
			return;
		}
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.zIncrBy(`leaderboard:${banList.name}:points`, points, id);
		await redis.client.quit();
	}

	async increaseWins(id: string): Promise<void> {
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.zIncrBy("leaderboard:wins", 1, id);
		await redis.client.quit();
	}

	async increaseLoses(id: string): Promise<void> {
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.zIncrBy("leaderboard:losses", 1, id);
		await redis.client.quit();
	}

	async increaseWinsByBanList(id: string, banList: BanList): Promise<void> {
		if (!banList.name) {
			return;
		}
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.zIncrBy(`leaderboard:${banList.name}:wins`, 1, id);
		await redis.client.quit();
	}

	async increaseLosesByBanList(id: string, banList: BanList): Promise<void> {
		if (!banList.name) {
			return;
		}
		const redis = Redis.getInstance();
		await redis.connect();
		await redis.client.zIncrBy(`leaderboard:${banList.name}:losses`, 1, id);
		await redis.client.quit();
	}
}
