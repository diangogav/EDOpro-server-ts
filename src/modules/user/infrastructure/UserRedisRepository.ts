import { Redis } from "../../shared/db/redis/infrastructure/Redis";
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
		await redis.client.quit();

		if (!user.username) {
			return null;
		}

		return new User(user);
	}
}
