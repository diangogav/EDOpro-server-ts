import { Logger } from "@shared/logger/domain/Logger";
import { YGOProResourceLoader } from "@ygopro/ygopro/YGOProResourceLoader";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { loadYgoproBanLists } from "./bootstrapBanListLoaders";

// Loads ygopro card resources and ban lists.
//
// Precondition: edopro ban lists must already be loaded. YGOProRoom cross-
// references them by name (BanListMemoryRepository) to resolve _edoBanListHash,
// so calling this before bootstrapEdoproResources yields empty hashes. The
// order is enforced by bootstrapResources.
export async function bootstrapYgoproResources(logger: Logger): Promise<void> {
	await YGOProResourceLoader.start();
	await YGOProResourceLoader.get().logLFLists();

	const tmp = await loadYgoproBanLists();
	YGOProBanListMemoryRepository.replaceAll(tmp);

	logger.info("🎴 YGOPro resources & ban lists loaded");
}
