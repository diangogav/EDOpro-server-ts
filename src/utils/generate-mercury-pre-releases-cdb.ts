import { PreReleasesMercurySQLiteTypeORM } from "src/shared/db/sqlite/infrastructure/PreReleasesMercurySQLiteTypeORM";
import LoggerFactory from "src/shared/logger/infrastructure/LoggerFactory";

const database = new PreReleasesMercurySQLiteTypeORM();
const logger = LoggerFactory.getLogger();

async function run() {
	logger.info("Initialize SQLite Connection");
	await database.connect();

	logger.info("SQLite Connection Success");
	await database.initialize();
}

run()
	.then(async () => {
		logger.info("Cdb file generated!");
		await database.disconnect();
	})
	.catch(async (error) => {
		logger.error(error as Error);
		await database.disconnect();
	});
