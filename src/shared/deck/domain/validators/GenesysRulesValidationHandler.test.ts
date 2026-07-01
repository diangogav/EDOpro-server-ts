import { Card } from "@shared/card/domain/Card";
import { CardTypes } from "@shared/card/domain/CardTypes";

import { Deck } from "../Deck";
import { BanListDeckError } from "../errors/BanListDeckError";
import { MainDeckLimitError } from "../errors/MainDeckLimitError";
import { GenesysRulesValidationHandler } from "./GenesysRulesValidationHandler";

function makeCard(
	code: string,
	{ type = CardTypes.TYPE_MONSTER, variant = 0, alias = "0" } = {},
): Card {
	return new Card({ alias, code, type, category: 0, variant });
}

function deckOf(cards: Card[]): Deck {
	return { allCards: cards } as unknown as Deck;
}

describe("GenesysRulesValidationHandler", () => {
	it("passes when the total point cost is within the cap", () => {
		const points = new Map<number, number>([
			[100, 40],
			[200, 50],
		]);
		const handler = new GenesysRulesValidationHandler(100, points);

		const result = handler.validate(deckOf([makeCard("100"), makeCard("200")]));

		expect(result).toBeNull();
	});

	it("fails when the total point cost exceeds the cap", () => {
		const points = new Map<number, number>([
			[100, 60],
			[200, 60],
		]);
		const handler = new GenesysRulesValidationHandler(100, points);

		const result = handler.validate(deckOf([makeCard("100"), makeCard("200")]));

		expect(result).toBeInstanceOf(MainDeckLimitError);
	});

	it("treats unlisted cards as zero points", () => {
		const handler = new GenesysRulesValidationHandler(100, new Map());

		const result = handler.validate(deckOf([makeCard("999"), makeCard("888")]));

		expect(result).toBeNull();
	});

	it("falls back to the alias point cost when the code is not listed", () => {
		const points = new Map<number, number>([[100, 30]]);
		const handler = new GenesysRulesValidationHandler(20, points);

		const result = handler.validate(deckOf([makeCard("999", { alias: "100" })]));

		expect(result).toBeInstanceOf(MainDeckLimitError);
	});

	it("rejects Pendulum and Link monsters", () => {
		const handler = new GenesysRulesValidationHandler(100, new Map());

		const pendulum = handler.validate(deckOf([makeCard("1", { type: CardTypes.TYPE_PENDULUM })]));
		const link = handler.validate(deckOf([makeCard("2", { type: CardTypes.TYPE_LINK })]));

		expect(pendulum).toBeInstanceOf(BanListDeckError);
		expect(link).toBeInstanceOf(BanListDeckError);
	});

	it("rejects prerelease cards (variant 8)", () => {
		const handler = new GenesysRulesValidationHandler(100, new Map());

		const result = handler.validate(deckOf([makeCard("1", { variant: 8 })]));

		expect(result).toBeInstanceOf(BanListDeckError);
	});
});
