import { LoadedBanListNamesSource } from "@shared/rank/domain/LoadedBanListNamesSource";

import edoproBanListMemoryRepository from "./BanListMemoryRepository";

export class EdoproLoadedBanListNamesSource implements LoadedBanListNamesSource {
	names(): string[] {
		return edoproBanListMemoryRepository.getOnlyWithName();
	}
}
