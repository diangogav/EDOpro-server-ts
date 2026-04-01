import { YGOProResourceLoader } from "@ygopro/ygopro";
import { YGOProBanList } from "../domain/YGOProBanList";

const banLists: YGOProBanList[] = [];

export default {
	add(banList: YGOProBanList): void {
		banLists.push(banList);
	},

	get(): YGOProBanList[] {
		return banLists;
	},

	/**
	 * Returns the index of the first banlist that contains " TCG" in its name.
	 * Used for TCG-only modes to find the appropriate banlist.
	 * Returns 0 as fallback if no TCG banlist is found.
	 */
	getFirstTCGIndex(): number {
		// Find the first banlist with " TCG" in the name (srvpro2 logic)
		const tcgIndex = banLists.findIndex(
			(list) => list.name && list.name.includes(" TCG"),
		);
		return tcgIndex >= 0 ? tcgIndex : 0;
	},

	findByHash(hash: number): YGOProBanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},

	findByName(name: string): YGOProBanList | null {
		return banLists.find((list) => list.name === name) ?? null;
	},

	findByAlias(alias: string): YGOProBanList | null {
		const index = this.findIndexByAlias(alias);
		return index !== -1 ? banLists[index] : null;
	},

	findIndexByAlias(alias: string): number {
		const normalizedAlias = alias.toLowerCase().replace(/\s+/g, "");
		return banLists.findIndex((list) => {
			if (!list.name) return false;
			const normalizedName = list.name.toLowerCase().replace(/\s+/g, "");
			return normalizedName.includes(normalizedAlias);
		});
	},

	findIndexByHash(hash: number): number {
		return banLists.findIndex((list) => list.hash === hash);
	},

	findLFListByIndex(lflistIndex: number): YGOProBanList | null {
		return banLists[lflistIndex] ?? null;
	},

	clear(): void {
		banLists.length = 0;
	},
};
