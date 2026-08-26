/**
 * Rush Duel's Legend rule is a credit limit, not a copy limit: a deck may carry
 * ONE Legend monster, ONE Legend spell and ONE Legend trap — not one copy of
 * each Legend card. Picking Blue-Eyes spends the whole monster allowance, and
 * the other 70 Legend monsters become unplayable in that deck.
 *
 * The `!RD` list expresses that with `$legend_monster 1` plus a membership line
 * per card. `ygopro-lflist-encode` parses it into `creditLimits`, which the
 * server used to drop on the floor — a three-Legend deck was accepted.
 */

import { BanList } from "@shared/ban-list/BanList";
import { Deck } from "../Deck";
import { CreditLimitDeckError } from "../errors/CreditLimitDeckError";
import { CreditLimitValidationHandler } from "./CreditLimitValidationHandler";

class TestBanList extends BanList {
	add(cardId: number, quantity: number): void {
		if (quantity === 0) this.forbidden.push(cardId);
	}
}

const BLUE_EYES = 120120000;
const DARK_MAGICIAN = 120130000;
const TIME_WIZARD = 120102002;
const MIRROR_FORCE = 120140001;
const VANILLA = 120305056;

function banListWithLegends(): TestBanList {
	const list = new TestBanList();
	list.addCreditLimit("legend_monster", 1);
	list.addCreditLimit("legend_trap", 1);
	for (const code of [BLUE_EYES, DARK_MAGICIAN, TIME_WIZARD]) {
		list.addCreditMember("legend_monster", code, 1);
	}
	list.addCreditMember("legend_trap", MIRROR_FORCE, 1);
	return list;
}

/** Deck stub — the handler only ever reads `allCards`. */
function deckOf(...codes: number[]): Deck {
	return {
		allCards: codes.map((code) => ({ code: String(code), alias: "0" })),
	} as unknown as Deck;
}

describe("CreditLimitValidationHandler", () => {
	it("accepts a deck spending exactly its allowance", () => {
		const handler = new CreditLimitValidationHandler(banListWithLegends());

		expect(handler.validate(deckOf(BLUE_EYES, MIRROR_FORCE, VANILLA, VANILLA))).toBeNull();
	});

	it("rejects two different Legend monsters", () => {
		// The rule people get wrong: these are different cards, one copy each,
		// and the deck is still illegal.
		const handler = new CreditLimitValidationHandler(banListWithLegends());

		const error = handler.validate(deckOf(BLUE_EYES, DARK_MAGICIAN));

		expect(error).toBeInstanceOf(CreditLimitDeckError);
	});

	it("rejects two copies of the same Legend monster", () => {
		const handler = new CreditLimitValidationHandler(banListWithLegends());

		expect(handler.validate(deckOf(BLUE_EYES, BLUE_EYES))).toBeInstanceOf(CreditLimitDeckError);
	});

	it("counts each category separately", () => {
		// One monster plus one trap spends two different allowances, not one.
		const handler = new CreditLimitValidationHandler(banListWithLegends());

		expect(handler.validate(deckOf(TIME_WIZARD, MIRROR_FORCE))).toBeNull();
	});

	it("reports the offending card so the client can point at it", () => {
		const handler = new CreditLimitValidationHandler(banListWithLegends());

		const error = handler.validate(deckOf(BLUE_EYES, DARK_MAGICIAN)) as CreditLimitDeckError;

		expect([BLUE_EYES, DARK_MAGICIAN]).toContain(error.code);
	});

	it("ignores cards that belong to no category", () => {
		const handler = new CreditLimitValidationHandler(banListWithLegends());

		expect(handler.validate(deckOf(VANILLA, VANILLA, VANILLA))).toBeNull();
	});

	it("passes through when the list declares no credit limits", () => {
		// Every non-Rush format. The handler must be inert there, not a tax.
		const handler = new CreditLimitValidationHandler(new TestBanList());

		expect(handler.validate(deckOf(BLUE_EYES, DARK_MAGICIAN, TIME_WIZARD))).toBeNull();
	});

	it("delegates to the next handler when it finds nothing", () => {
		const handler = new CreditLimitValidationHandler(banListWithLegends());
		const next = { validate: jest.fn().mockReturnValue(null), setNextHandler: jest.fn() };
		handler.setNextHandler(next as never);

		handler.validate(deckOf(VANILLA));

		expect(next.validate).toHaveBeenCalled();
	});

	it("does not reach the next handler once a deck is already illegal", () => {
		const handler = new CreditLimitValidationHandler(banListWithLegends());
		const next = { validate: jest.fn().mockReturnValue(null), setNextHandler: jest.fn() };
		handler.setNextHandler(next as never);

		handler.validate(deckOf(BLUE_EYES, DARK_MAGICIAN));

		expect(next.validate).not.toHaveBeenCalled();
	});
});
