import { Logger } from "@shared/logger/domain/Logger";
import { YGOProBanListLoader } from "@ygopro/ban-list/infrastructure/YGOProBanListLoader";
import { YGOProResourceLoader } from "@ygopro/ygopro/YGOProResourceLoader";

// Loads ygopro card resources and ban lists.
//
// Precondition: edopro ban lists must already be loaded. YGOProRoom cross-
// references them by name (BanListMemoryRepository) to resolve _edoBanListHash,
// so calling this before bootstrapEdoproResources yields empty hashes. The
// order is enforced by bootstrapResources.
export async function bootstrapYgoproResources(logger: Logger): Promise<void> {
	await YGOProResourceLoader.start();
	await YGOProResourceLoader.get().logLFLists();

	const banLists = new YGOProBanListLoader();
	await banLists.load();

	logger.info("🎴 YGOPro resources & ban lists loaded");
}
