import BanListMemoryRepository from "../../ban-list/infrastructure/BanListMemoryRepository";
import { Redis } from "../../shared/db/redis/infrastructure/Redis";
import { Rank } from "../../shared/value-objects/Rank";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserRedisRepository implements UserRepository {
	async findBy(username: string): Promise<User | null> {
		const redis = Redis.getInstance();
		await redis.connect();
		const user = (await redis.client.hGetAll(`user:${username}`)) as {
			username: string;
			password: string;
		};
		const banlistNames = BanListMemoryRepository.getOnlyWithName();

		const positionRequests = banlistNames.map((name) =>
			redis.client.zRevRank(`leaderboard:${name}:points`, username)
		);

		const scoreRequests = banlistNames.map((name) =>
			redis.client.zScore(`leaderboard:${name}:points`, username)
		);

		const positionResponses = await Promise.allSettled([
			redis.client.zRevRank("leaderboard:points", username),
			...positionRequests,
		]);

		const scoreResponses = await Promise.allSettled([
			redis.client.zScore("leaderboard:points", username),
			...scoreRequests,
		]);

		const positions = positionResponses
			.filter((item) => item.status === "fulfilled")
			.map((data: PromiseSettledResult<unknown>) => (data as PromiseFulfilledResult<number>).value);

		const scores = scoreResponses
			.filter((item) => item.status === "fulfilled")
			.map((data: PromiseSettledResult<unknown>) => (data as PromiseFulfilledResult<number>).value);

		if (!user.username) {
			await redis.client.quit();

			return null;
		}

		const userRanks = banlistNames.map((item, index) => {
			if (index === 0) {
				return new Rank({
					name: "Global",
					position: (positions[0] ?? Number.POSITIVE_INFINITY) + 1,
					points: scores[index] ?? 0,
				});
			}

			return new Rank({
				name: banlistNames[index - 1],
				position: (positions[index] ?? Number.POSITIVE_INFINITY) + 1,
				points: scores[index] ?? 0,
			});
		});

		await redis.client.quit();

		return new User({
			...user,
			ranks: userRanks,
		});
	}
}
