import { BanList } from "../domain/BanList";

const banLists: BanList[] = [];

export default {
	add(banList: BanList): void {
		banLists.push(banList);
	},

	get(): BanList[] {
		return banLists;
	},

	findByHash(hash: number): BanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},
};
