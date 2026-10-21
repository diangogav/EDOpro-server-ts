import edoproBanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import ygoproBanListMemoryRepository from "src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";

import { LoadedBanListNamesProvider } from "../domain/LoadedBanListNamesProvider";

/**
 * Loaded banlist names of each server's in-memory repository, EDOPro first,
 * each set deduped. Reads live on every call so banlist hot reloads are
 * reflected immediately.
 */
export class InMemoryLoadedBanListNamesProvider implements LoadedBanListNamesProvider {
	nameSets(): string[][] {
		const edoproNames = edoproBanListMemoryRepository.getOnlyWithName();
		const ygoproNames = ygoproBanListMemoryRepository
			.get()
			.map((banList) => banList.name)
			.filter((name): name is string => name !== null);

		return [[...new Set(edoproNames)], [...new Set(ygoproNames)]];
	}
}
