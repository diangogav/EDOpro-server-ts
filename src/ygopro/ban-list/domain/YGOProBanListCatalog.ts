import { YGOProBanList } from "./YGOProBanList";

/** The YGOPro ban lists currently loaded (YGOProBanListMemoryRepository). */
export interface YGOProBanListCatalog {
	findByHash(hash: number): YGOProBanList | null;
	findLFListByIndex(lflistIndex: number): YGOProBanList | null;
	findIndexByAlias(alias: string): number;
	getNewestTCGIndex(): number;
	getFirstOCGIndex(): number;
}

let registered: YGOProBanListCatalog | null = null;

/** Registers the loaded catalog; boot calls it before any room exists. */
export function useYGOProBanListCatalog(catalog: YGOProBanListCatalog): void {
	registered = catalog;
}

export function ygoproBanListCatalog(): YGOProBanListCatalog {
	if (!registered) {
		throw new Error(
			"YGOPro ban list catalog is not registered: call registerBanListCatalogs() at boot",
		);
	}

	return registered;
}
