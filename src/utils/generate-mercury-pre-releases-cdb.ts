import { PreReleasesMercurySQLiteTypeORM } from "src/shared/db/sqlite/infrastructure/PreReleasesMercurySQLiteTypeORM";
import { Pino } from "src/shared/logger/infrastructure/Pino";

const database = new PreReleasesMercurySQLiteTypeORM();
const logger = new Pino();

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
