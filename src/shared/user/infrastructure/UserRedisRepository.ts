import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";

import { Redis } from "../../../shared/db/redis/infrastructure/Redis";
import { Rank } from "../../../shared/value-objects/Rank";
import { User } from "../domain/User";
import { UserRepository } from "../domain/UserRepository";

export class UserRedisRepository implements UserRepository {
	async findBy(username: string): Promise<User | null> {
		const redis = Redis.getInstance();
		if (!redis) {
			return null;
		}
		const user = (await redis.hgetall(`user:${username}`)) as {
			username: string;
			password: string;
		};
		const banListNames = BanListMemoryRepository.getOnlyWithName();

		const positionRequests = banListNames.map((name) =>
			redis.zrevrank(`leaderboard:${name}:points`, username)
		);

		const scoreRequests = banListNames.map((name) =>
			redis.zscore(`leaderboard:${name}:points`, username)
		);

		const positionResponses = await Promise.allSettled([
			redis.zrevrank("leaderboard:points", username),
			...positionRequests,
		]);

		const scoreResponses = await Promise.allSettled([
			redis.zscore("leaderboard:points", username),
			...scoreRequests,
		]);

		const positions = positionResponses
			.filter((item) => item.status === "fulfilled")
			.map((data: PromiseSettledResult<unknown>) => (data as PromiseFulfilledResult<number>).value);

		const scores = scoreResponses
			.filter((item) => item.status === "fulfilled")
			.map((data: PromiseSettledResult<unknown>) => (data as PromiseFulfilledResult<number>).value);

		if (!user.username) {
			return null;
		}

		const userRanks = banListNames.map((item, index) => {
			if (index === 0) {
				return new Rank({
					name: "Global",
					position: (positions[0] ?? Number.POSITIVE_INFINITY) + 1,
					points: scores[index] ?? 0,
				});
			}

			return new Rank({
				name: banListNames[index - 1],
				position: (positions[index] ?? Number.POSITIVE_INFINITY) + 1,
				points: scores[index] ?? 0,
			});
		});

		return new User({
			...user,
			ranks: userRanks,
		});
	}
}
