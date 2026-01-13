import { MercuryBanList } from "../domain/MercuryBanList";

const banLists: MercuryBanList[] = [];

export default {
	add(banList: MercuryBanList): void {
		banLists.push(banList);
	},

	get(): MercuryBanList[] {
		return banLists;
	},

	getLastTCGIndex(): number {
		return banLists.findIndex((item: MercuryBanList) => item.tcg);
	},

	findByHash(hash: number): MercuryBanList | null {
		return banLists.find((list) => list.hash === hash) ?? null;
	},

	findByName(name: string): MercuryBanList | null {
		return banLists.find((list) => list.name === name) ?? null;
	}
};
