import { Card } from "@shared/card/domain/Card";
import { CardTypes } from "@shared/card/domain/CardTypes";
import { DeckRules } from "@shared/room/domain/YgoRoom";

import { Deck } from "../Deck";
import { MainDeckLimitError } from "../errors/MainDeckLimitError";
import { SideDeckLimitError } from "../errors/SideDeckLimitError";
import { Rule } from "../Rule";
import { DeckLimitsValidationHandler } from "./DeckLimitsValidationHandler";

function cards(amount: number, type: number = CardTypes.TYPE_MONSTER): Card[] {
	return Array.from(
		{ length: amount },
		(_, index) => new Card({ alias: "0", code: `${type}${index}`, type, category: 0, variant: 0 }),
	);
}

function skills(amount: number): Card[] {
	return cards(amount, CardTypes.TYPE_SKILL);
}

function deckOf({ main = [], side = [] }: { main?: Card[]; side?: Card[] }): Deck {
	return { main, side, extra: [] } as unknown as Deck;
}

function rulesOf(mainMin: number, mainMax: number, sideMax: number): DeckRules {
	return new DeckRules({
		mainMin,
		mainMax,
		extraMin: 0,
		extraMax: 15,
		sideMin: 0,
		sideMax,
		rule: Rule.ALL,
	});
}

describe("DeckLimitsValidationHandler", () => {
	const speedLimits = new DeckLimitsValidationHandler(rulesOf(20, 30, 6));
	const standardLimits = new DeckLimitsValidationHandler(rulesOf(40, 60, 15));

	it("leaves a Skill in the Main Deck out of the Main Deck size", () => {
		const error = speedLimits.validate(deckOf({ main: [...cards(30), ...skills(1)] }));

		expect(error).toBeNull();
	});

	it("reports the Main Deck size without its Skills when it is out of bounds", () => {
		const error = speedLimits.validate(deckOf({ main: [...cards(31), ...skills(1)] }));

		expect(error).toBeInstanceOf(MainDeckLimitError);
		expect(error).toMatchObject({ got: 31, min: 20, max: 30 });
	});

	it("does not let a Skill fill a Main Deck below the minimum", () => {
		const error = speedLimits.validate(deckOf({ main: [...cards(19), ...skills(1)] }));

		expect(error).toMatchObject({ got: 19, min: 20, max: 30 });
	});

	it("counts the Skills of the Side Deck toward the Side Deck size", () => {
		const error = speedLimits.validate(
			deckOf({ main: cards(20), side: [...cards(5), ...skills(2)] }),
		);

		expect(error).toBeInstanceOf(SideDeckLimitError);
		expect(error).toMatchObject({ got: 7, min: 0, max: 6 });
	});

	it("counts every card of a Main Deck without Skills", () => {
		expect(standardLimits.validate(deckOf({ main: cards(40) }))).toBeNull();
		expect(standardLimits.validate(deckOf({ main: cards(39) }))).toMatchObject({ got: 39 });
		expect(standardLimits.validate(deckOf({ main: cards(61) }))).toMatchObject({ got: 61 });
	});
});
