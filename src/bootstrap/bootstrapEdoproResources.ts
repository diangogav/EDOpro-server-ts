import { Logger } from "@shared/logger/domain/Logger";
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { loadEdoproBanLists } from "./bootstrapBanListLoaders";

// Loads edopro ban lists into BanListMemoryRepository via loadEdoproBanLists().
// Note: these are also read by the ygopro path (see bootstrapYgoproResources),
// not only by edopro.
export async function bootstrapEdoproResources(logger: Logger): Promise<void> {
	const tmp = await loadEdoproBanLists();
	BanListMemoryRepository.replaceAll(tmp);

	logger.info("🎴 EdoPro ban lists loaded");
}
