import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { EdoProSQLiteTypeORM } from "@edopro/card/infrastructure/sqlite/EdoProSQLiteTypeORM";
import { Logger } from "@shared/logger/domain/Logger";

import { config } from "src/config";
import { PostgresTypeORM } from "src/evolution-types/src/PostgresTypeORM";

// Opens every datastore connection the server depends on. Postgres is only
// touched when ranking is enabled; SQLite and Redis are always required.
export async function bootstrapPersistence(logger: Logger): Promise<void> {
	const sqlite = new EdoProSQLiteTypeORM();
	await sqlite.connect();
	await sqlite.initialize();
	logger.info("🗄️  SQLite connected");

	if (config.ranking.enabled) {
		const postgres = new PostgresTypeORM();
		await postgres.connect();
		logger.info("🗄️  Postgres connected · ranking ON");
	}

	const redis = new Redis();
	await redis.connect();
}
