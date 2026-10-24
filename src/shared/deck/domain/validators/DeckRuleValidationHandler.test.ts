import { Card, ScopeCode } from "@shared/card/domain/Card";
import { Deck } from "@shared/deck/domain/Deck";
import { DeckErrorType } from "@shared/deck/domain/errors/DeckErrorType";
import { Rule } from "@shared/deck/domain/Rule";
import { DeckRules } from "@shared/room/domain/YgoRoom";

import { DeckRuleValidationHandler } from "./DeckRuleValidationHandler";

function deckWith(variant: number): Deck {
	const card = { code: "12345", variant } as unknown as Card;

	return { allCards: [card] } as unknown as Deck;
}

function validate(rule: Rule, variant: number): ReturnType<DeckRuleValidationHandler["validate"]> {
	return new DeckRuleValidationHandler({ rule } as DeckRules).validate(deckWith(variant));
}

describe("DeckRuleValidationHandler", () => {
	it("reports a TCG card in an OCG-only room as TCG only", () => {
		expect(validate(Rule.ONLY_OCG, ScopeCode.TCG)).toMatchObject({
			type: DeckErrorType.CARD_TCG_ONLY,
			code: 12345,
		});
	});

	it("reports an OCG card in a TCG-only room as OCG only", () => {
		expect(validate(Rule.ONLY_TCG, ScopeCode.OCG)).toMatchObject({
			type: DeckErrorType.CARD_OCG_ONLY,
			code: 12345,
		});
	});

	it("accepts cards that carry the room's scope", () => {
		expect(validate(Rule.ONLY_OCG, ScopeCode.OCG)).toBeNull();
		expect(validate(Rule.ONLY_TCG, ScopeCode.TCG)).toBeNull();
	});

	it("does not restrict scope outside the OCG-only and TCG-only rules", () => {
		expect(validate(Rule.ALL, ScopeCode.OCG)).toBeNull();
	});
});
