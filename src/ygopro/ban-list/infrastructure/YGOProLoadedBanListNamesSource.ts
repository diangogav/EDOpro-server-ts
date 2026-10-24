import { LoadedBanListNamesSource } from "@shared/rank/domain/LoadedBanListNamesSource";

import ygoproBanListMemoryRepository from "./YGOProBanListMemoryRepository";

export class YGOProLoadedBanListNamesSource implements LoadedBanListNamesSource {
	names(): string[] {
		return ygoproBanListMemoryRepository
			.get()
			.map((banList) => banList.name)
			.filter((name): name is string => name !== null);
	}
}
