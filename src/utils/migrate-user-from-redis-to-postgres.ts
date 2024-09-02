import * as fs from "fs";
import { PostgresTypeORM } from "src/shared/db/postgres/infrastructure/PostgresTypeORM";
import { Redis } from "src/shared/db/redis/infrastructure/Redis";
import { Pino } from "src/shared/logger/infrastructure/Pino";
import { UserProfileCreator } from "src/shared/user-profile/application/UserProfileCreator";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

const redis = Redis.getInstance();
const logger = new Pino();
const postgresDatabase = new PostgresTypeORM();

const migratedUsersFile = "migrated_users.txt";
const skippedUsersFile = "skipped_users.txt";

async function run() {
	if (!redis) {
		return;
	}
	await postgresDatabase.connect();
	const userProfileCreator = new UserProfileCreator(new UserProfilePostgresRepository());

	const userKeys = await redis.keys("user:*");
	const filteredKeys = userKeys.filter((key) => !key.includes(":duels"));

	for (const key of filteredKeys) {
		// eslint-disable-next-line no-await-in-loop
		const userInfo: Record<string, string> = await redis.hgetall(key);

		// Verificar si el usuario tiene username y password
		if (!userInfo.username || !userInfo.password) {
			// Escribir en el archivo de usuarios omitidos
			fs.appendFileSync(skippedUsersFile, `User key ${key}: ${JSON.stringify(userInfo)}\n`);
			logger.error(`User key ${key} skipped due to missing username or password.`);
			continue;
		}

		// eslint-disable-next-line no-await-in-loop
		await userProfileCreator.run({
			username: userInfo.username,
			email: userInfo.email,
			password: userInfo.password,
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			avatar: userInfo?.avatar ?? null,
		});

		// Escribir en el archivo de usuarios migrados
		fs.appendFileSync(migratedUsersFile, `User key ${key}: ${JSON.stringify(userInfo)}\n`);

		logger.info(`User key ${key} migrated successfully.`);
	}
}

run()
	.then(async () => {
		logger.info("All users processed");
		await postgresDatabase.close();
	})
	.catch(async (error) => {
		logger.error(error as Error);
		await postgresDatabase.close();
	});
