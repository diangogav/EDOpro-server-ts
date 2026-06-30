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

	// EDOPro card DB hot-reload is intentionally disabled: the C++ core opens the
	// fixed path evolution_cards.db (core CardSqliteRepository), and the previous
	// reloader swapped to a timestamped file and deleted evolution_cards.db, leaving
	// the core to crash mid-duel with "no such table: datas". Re-enable only once the
	// reload refreshes evolution_cards.db in place (atomic rename at the fixed path).

	if (config.ranking.enabled) {
		const postgres = new PostgresTypeORM();
		await postgres.connect();
		logger.info("🗄️  Postgres connected · ranking ON");
	}

	const redis = new Redis();
	await redis.connect();
}
