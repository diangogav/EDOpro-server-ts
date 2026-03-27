import { YGOProBanList } from "../domain/YGOProBanList";

const banLists: YGOProBanList[] = [];

export default {
	add(banList: YGOProBanList): void {
		banLists.push(banList);
	},

	get(): YGOProBanList[] {
		return banLists;
	},

	getLastTCGIndex(): number {
		return 0;
	},

	findByHash(hash: number): YGOProBanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},

	findByName(name: string): YGOProBanList | null {
		return banLists.find((list) => list.name === name) ?? null;
	}
};
