import { EdoProBanListLoader } from "@edopro/ban-list/infrastructure/BanListLoader";
import { Logger } from "@shared/logger/domain/Logger";
import { YGOProBanListLoader } from "@ygopro/ban-list/infrastructure/YGOProBanListLoader";
import { YGOProResourceLoader } from "@ygopro/ygopro/YGOProResourceLoader";

// Loads card resources and ban lists into memory. Must run before any server
// accepts connections, since duels resolve cards and ban lists from memory.
export async function bootstrapResources(logger: Logger): Promise<void> {
	const edoBanLists = new EdoProBanListLoader();
	await edoBanLists.loadDirectory("resources/edopro/banlists-evolution");
	await edoBanLists.loadDirectory("resources/edopro/banlists-ignis");

	await YGOProResourceLoader.start();
	await YGOProResourceLoader.get().logLFLists();

	const ygoBanLists = new YGOProBanListLoader();
	await ygoBanLists.load();

	logger.info("🎴 YGOPro resources & ban lists loaded");
}
