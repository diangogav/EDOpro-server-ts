import { BanList } from "src/shared/ban-list/BanList";

import { toBanListViews } from "./BanListView";

class FakeBanList extends BanList {
	add(cardId: number, quantity: number): void {
		if (quantity === 0) {
			this.forbidden.push(cardId);
		} else if (quantity === 1) {
			this.limited.push(cardId);
		} else if (quantity === 2) {
			this.semiLimited.push(cardId);
		} else {
			this.all.push(cardId);
		}
	}
}

const buildBanList = (name: string | null): FakeBanList => {
	const banList = new FakeBanList();
	if (name !== null) {
		banList.setName(name);
	}

	return banList;
};

describe("toBanListViews", () => {
	it("returns an empty array when there are no ban lists", () => {
		expect(toBanListViews([])).toEqual([]);
	});

	it("maps name and per-category counts", () => {
		const banList = buildBanList("2024.10 TCG");
		banList.add(111, 0);
		banList.add(222, 0);
		banList.add(333, 1);
		banList.add(444, 2);

		expect(toBanListViews([banList])).toEqual([
			{ name: "2024.10 TCG", forbidden: 2, limited: 1, semiLimited: 1 },
		]);
	});

	it("skips ban lists without a name", () => {
		const named = buildBanList("2024.10 TCG");
		const unnamed = buildBanList(null);

		const views = toBanListViews([named, unnamed]);

		expect(views).toHaveLength(1);
		expect(views[0].name).toBe("2024.10 TCG");
	});
});
