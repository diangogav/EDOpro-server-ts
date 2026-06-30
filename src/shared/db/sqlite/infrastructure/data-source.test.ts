import { DataSource } from "typeorm";

import { buildCardDataSource, getCardDataSource, swapCardDataSource } from "./data-source";

describe("card datasource holder", () => {
	it("starts with a usable datasource", () => {
		expect(getCardDataSource()).toBeInstanceOf(DataSource);
	});

	it("swaps the current datasource and returns the replaced one", () => {
		const original = getCardDataSource();
		const next = buildCardDataSource("evolution_cards.test.db");

		const replaced = swapCardDataSource(next);

		expect(replaced).toBe(original);
		expect(getCardDataSource()).toBe(next);

		// restore so the swap does not leak into other tests in this file
		swapCardDataSource(original);
		expect(getCardDataSource()).toBe(original);
	});
});
