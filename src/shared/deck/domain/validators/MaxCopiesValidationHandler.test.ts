import { Card } from "@shared/card/domain/Card";
import { CardTypes } from "@shared/card/domain/CardTypes";

import { Deck } from "../Deck";
import { CardMoreThan3Error } from "../errors/CardMoreThan3Error";
import { MaxCopiesValidationHandler } from "./MaxCopiesValidationHandler";

function card(code: string, alias = "0"): Card {
	return new Card({ alias, code, type: CardTypes.TYPE_MONSTER, category: 0, variant: 0 });
}

function deckOf(cards: Card[]): Deck {
	return { allCards: cards } as unknown as Deck;
}

function copies(code: string, n: number, alias = "0"): Card[] {
	return Array.from({ length: n }, () => card(code, alias));
}

describe("MaxCopiesValidationHandler", () => {
	const handler = new MaxCopiesValidationHandler();

	it("passes when every card has at most 3 copies", () => {
		const result = handler.validate(deckOf([...copies("100", 3), ...copies("200", 1)]));
		expect(result).toBeNull();
	});

	it("fails when a card has more than 3 copies", () => {
		const result = handler.validate(deckOf(copies("100", 4)));
		expect(result).toBeInstanceOf(CardMoreThan3Error);
	});

	it("counts copies across main, extra and side (allCards)", () => {
		// allCards already flattens the three zones; 2 + 2 of the same code = 4
		const result = handler.validate(deckOf([...copies("100", 2), ...copies("100", 2)]));
		expect(result).toBeInstanceOf(CardMoreThan3Error);
	});

	it("unifies alternate artworks via alias (2 canonical + 2 alt = 4)", () => {
		const canonical = copies("100", 2); // code 100, alias 0
		const altArt = copies("999", 2, "100"); // code 999, alias -> 100
		const result = handler.validate(deckOf([...canonical, ...altArt]));
		expect(result).toBeInstanceOf(CardMoreThan3Error);
	});

	it("does not merge distinct cards", () => {
		const result = handler.validate(deckOf([...copies("100", 3), ...copies("200", 3)]));
		expect(result).toBeNull();
	});
});
