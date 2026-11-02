import { EdoproBanList } from "./BanList";

/** The EDOPro ban lists currently loaded (BanListMemoryRepository). */
export interface EdoproBanListCatalog {
	findByHash(hash: number): EdoproBanList | null;
}

let registered: EdoproBanListCatalog | null = null;

/** Registers the loaded catalog; boot calls it before any room exists. */
export function useEdoproBanListCatalog(catalog: EdoproBanListCatalog): void {
	registered = catalog;
}

export function edoproBanListCatalog(): EdoproBanListCatalog {
	if (!registered) {
		throw new Error(
			"EDOPro ban list catalog is not registered: call registerBanListCatalogs() at boot",
		);
	}

	return registered;
}
