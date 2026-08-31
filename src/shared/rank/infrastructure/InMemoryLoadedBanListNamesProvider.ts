import edoproBanListMemoryRepository from "src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import ygoproBanListMemoryRepository from "src/ygopro/ban-list/infrastructure/YGOProBanListMemoryRepository";

import { LoadedBanListNamesProvider } from "../domain/LoadedBanListNamesProvider";

/**
 * Loaded banlist names across both servers' in-memory repositories, deduped.
 * Reads live on every call so banlist hot reloads are reflected immediately.
 */
export class InMemoryLoadedBanListNamesProvider implements LoadedBanListNamesProvider {
	names(): string[] {
		const edoproNames = edoproBanListMemoryRepository.getOnlyWithName();
		const ygoproNames = ygoproBanListMemoryRepository
			.get()
			.map((banList) => banList.name)
			.filter((name): name is string => name !== null);

		return [...new Set([...edoproNames, ...ygoproNames])];
	}
}
