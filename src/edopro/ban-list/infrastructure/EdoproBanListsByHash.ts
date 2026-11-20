import { BanList } from "@shared/ban-list/BanList";
import { BanListsByHash } from "@shared/ban-list/BanListsByHash";

import BanListMemoryRepository from "./BanListMemoryRepository";

/**
 * Reads the EDOPro ban lists currently loaded. The wire carries a hash
 * unsigned and a loaded list keeps the signed result of the XOR that builds
 * it, so both are compared as unsigned.
 */
export class EdoproBanListsByHash implements BanListsByHash {
	public findByHash(hash: number): BanList | null {
		return BanListMemoryRepository.get().find((list) => list.hash >>> 0 === hash >>> 0) ?? null;
	}
}
