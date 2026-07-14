import { EdoProBanListLoader } from "@edopro/ban-list/infrastructure/BanListLoader";
import { Logger } from "@shared/logger/domain/Logger";
import { config } from "src/config";

// Loads edopro ban lists into BanListMemoryRepository. Note: these are also
// read by the ygopro path (see bootstrapYgoproResources), not only by edopro.
export async function bootstrapEdoproResources(logger: Logger): Promise<void> {
	const banLists = new EdoProBanListLoader();
	await banLists.loadDirectory(`${config.resources.dir}/edopro/evolution-lflists`);
	await banLists.loadDirectory(`${config.resources.dir}/edopro/lflists`);

	logger.info("🎴 EdoPro ban lists loaded");
}
