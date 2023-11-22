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
		const requests = banlistNames.map((name) =>
			redis.client.zRevRank(`leaderboard:${name}:points`, username)
		);

		const ranksResponses = await Promise.allSettled([
			redis.client.zRevRank("leaderboard:points", username),
			...requests,
		]);

		const ranks = ranksResponses
			.filter((item) => item.status === "fulfilled")
			.map((data: PromiseSettledResult<unknown>) => (data as PromiseFulfilledResult<number>).value);

		if (!user.username) {
			await redis.client.quit();

			return null;
		}

		const userRanks = banlistNames.map((item, index) => {
			if (!index) {
				return new Rank({ name: "Global", value: ranks[0] });
			}

			return new Rank({
				name: banlistNames[index],
				value: ranks[index] ?? Number.POSITIVE_INFINITY,
			});
		});

		await redis.client.quit();

		return new User({
			...user,
			ranks: userRanks,
		});
	}
}
