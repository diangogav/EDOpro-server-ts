import { Card } from "@shared/card/domain/Card";
import { CardTypes } from "@shared/card/domain/CardTypes";
import { Deck } from "@shared/deck/domain/Deck";
import { DeckErrorType } from "@shared/deck/domain/errors/DeckErrorType";
import { YGOProRule } from "@ygopro/room/domain/host-info/YGOProRule";

import { CardAvailabilityValidationHandler } from "./CardAvailabilityValidationHandler";

const OCG = 0x1;
const TCG = 0x2;
const CUSTOM = 0x4;
const SC = 0x8;

function deckWith(ot: number): Deck {
	const card = new Card({
		alias: "0",
		code: "12345",
		type: CardTypes.TYPE_MONSTER,
		category: 0,
		variant: ot,
	});

	return { allCards: [card] } as unknown as Deck;
}

function validate(
	rule: YGOProRule,
	ot: number,
): ReturnType<CardAvailabilityValidationHandler["validate"]> {
	return new CardAvailabilityValidationHandler(rule).validate(deckWith(ot));
}

describe("CardAvailabilityValidationHandler", () => {
	it("limits an OCG room to cards with the OCG bit", () => {
		expect(validate(YGOProRule.OCG, OCG)).toBeNull();
		expect(validate(YGOProRule.OCG, TCG)).toMatchObject({
			type: DeckErrorType.CARD_TCG_ONLY,
			code: 12345,
		});
	});

	it("limits a TCG room to cards with the TCG bit", () => {
		expect(validate(YGOProRule.TCG, TCG)).toBeNull();
		expect(validate(YGOProRule.TCG, OCG)).toMatchObject({
			type: DeckErrorType.CARD_OCG_ONLY,
			code: 12345,
		});
	});

	it("limits a Simplified Chinese room to cards with the SC bit", () => {
		expect(validate(YGOProRule.SC, SC)).toBeNull();
		expect(validate(YGOProRule.SC, OCG | TCG | SC)).toBeNull();
		expect(validate(YGOProRule.SC, OCG)).toMatchObject({ type: DeckErrorType.CARD_OCG_ONLY });
	});

	it("rejects official cards in a custom room", () => {
		expect(validate(YGOProRule.CUSTOM, OCG | TCG)).toMatchObject({
			type: DeckErrorType.CARD_OCG_ONLY,
		});
	});

	it("requires both the OCG and TCG bits in a no-unique room", () => {
		expect(validate(YGOProRule.NO_UNIQUE, OCG | TCG)).toBeNull();
		expect(validate(YGOProRule.NO_UNIQUE, OCG)).toMatchObject({
			type: DeckErrorType.CARD_OCG_ONLY,
		});
		expect(validate(YGOProRule.NO_UNIQUE, TCG)).toMatchObject({
			type: DeckErrorType.CARD_TCG_ONLY,
		});
	});

	it("accepts any card in an all-cards room", () => {
		expect(validate(YGOProRule.ALL, OCG)).toBeNull();
		expect(validate(YGOProRule.ALL, SC)).toBeNull();
	});

	it("accepts custom cards under every rule", () => {
		for (const rule of [YGOProRule.OCG, YGOProRule.TCG, YGOProRule.SC, YGOProRule.NO_UNIQUE]) {
			expect(validate(rule, CUSTOM)).toBeNull();
		}
	});
});
