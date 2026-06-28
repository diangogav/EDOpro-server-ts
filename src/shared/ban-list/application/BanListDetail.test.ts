import { BanList } from "src/shared/ban-list/BanList";

import { toBanListDetail } from "./BanListDetail";

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

const names: Record<number, string> = {
	111: "Forbidden One",
	222: "Limited One",
	333: "Semi One",
};
const resolve = (id: number): string | null => names[id] ?? null;

describe("toBanListDetail", () => {
	it("resolves card names per category and leaves unknown ids as null", () => {
		const banList = new FakeBanList();
		banList.setName("2024.10 TCG");
		banList.add(111, 0);
		banList.add(222, 1);
		banList.add(333, 2);
		banList.add(444, 0);

		const detail = toBanListDetail(banList, resolve);

		expect(detail.name).toBe("2024.10 TCG");
		expect(detail.isWhitelist).toBe(false);
		expect(detail.forbidden).toEqual([
			{ id: 111, name: "Forbidden One" },
			{ id: 444, name: null },
		]);
		expect(detail.limited).toEqual([{ id: 222, name: "Limited One" }]);
		expect(detail.semiLimited).toEqual([{ id: 333, name: "Semi One" }]);
		expect(detail.whitelisted).toEqual([]);
	});

	it("exposes the allowed list as whitelisted only for whitelist ban lists", () => {
		const banList = new FakeBanList();
		banList.setName("Whitelist Format");
		banList.whileListed();
		banList.add(111, 3);
		banList.add(555, 3);

		const detail = toBanListDetail(banList, resolve);

		expect(detail.isWhitelist).toBe(true);
		expect(detail.whitelisted).toEqual([
			{ id: 111, name: "Forbidden One" },
			{ id: 555, name: null },
		]);
	});
});
