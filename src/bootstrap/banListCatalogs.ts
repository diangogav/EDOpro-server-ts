import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { useEdoproBanListCatalog } from "@edopro/ban-list/domain/EdoproBanListCatalog";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import YGOProBanListMemoryRepository from "@ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";
import { useYGOProBanListCatalog } from "@ygopro/ban-list/domain/YGOProBanListCatalog";
import { useRuleMappingsLogger } from "@ygopro/room/domain/ruleMappingsLogger";

/**
 * Lets room domain code read the loaded ban lists. The in-memory repositories
 * are registered themselves, so every lookup still reads the lists loaded at
 * that moment, including after a hot reload.
 */
export function registerBanListCatalogs(): void {
	useEdoproBanListCatalog(BanListMemoryRepository);
	useYGOProBanListCatalog(YGOProBanListMemoryRepository);
	useRuleMappingsLogger(LoggerFactory.getLogger());
}
