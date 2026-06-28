import { EdoProBanListLoader } from "@edopro/ban-list/infrastructure/BanListLoader";
import { Logger } from "@shared/logger/domain/Logger";

// Loads edopro ban lists into BanListMemoryRepository. Note: these are also
// read by the ygopro path (see bootstrapYgoproResources), not only by edopro.
export async function bootstrapEdoproResources(logger: Logger): Promise<void> {
	const banLists = new EdoProBanListLoader();
	await banLists.loadDirectory("resources/edopro/banlists-evolution");
	await banLists.loadDirectory("resources/edopro/banlists-ignis");

	logger.info("🎴 EdoPro ban lists loaded");
}
