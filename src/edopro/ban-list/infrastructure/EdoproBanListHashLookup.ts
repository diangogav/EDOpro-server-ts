import { BanListHashLookup } from "@shared/ban-list/BanListHashLookup";

import BanListMemoryRepository from "./BanListMemoryRepository";

/** Reads the hash from the EDOPro ban lists currently loaded. */
export class EdoproBanListHashLookup implements BanListHashLookup {
	hashByName(name: string): number | undefined {
		return BanListMemoryRepository.findByName(name)?.hash;
	}
}
