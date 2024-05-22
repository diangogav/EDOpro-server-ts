type MercuryBanList = { date: string; tcg: boolean };

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
};
