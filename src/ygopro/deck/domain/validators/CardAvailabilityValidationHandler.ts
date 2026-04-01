import { ScopeCode, Card } from "@shared/card/domain/Card";
import { Deck } from "@shared/deck/domain/Deck";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { NotOfficialCardError } from "@shared/deck/domain/errors/NotOfficialCardError";
import { OCGCardError } from "@shared/deck/domain/errors/OCGCardError";
import { TCGCardError } from "@shared/deck/domain/errors/TCGCardError";
import { DeckValidationHandler } from "@shared/deck/domain/validators/DeckValidationHandler";
import { Rule } from "@shared/deck/domain/Rule";

/**
 * Card availability validation aligned with srvpro2's checkAvail logic.
 *
 * Uses bitwise checks instead of numeric comparison (Multirole style).
 * Key differences vs shared OfficialCardValidationHandler:
 * - Cards with ANIME flag (0x4) always pass (custom card bypass)
 * - Bitwise match: (cardOt & availFlag) === availFlag
 * - Prerelease cards with OCG+TCG bits pass in OCG_TCG mode
 */
export class CardAvailabilityValidationHandler implements DeckValidationHandler {
	private readonly availFlag: number;
	private nextHandler: DeckValidationHandler | null = null;

	constructor(rule: Rule) {
		this.availFlag = CardAvailabilityValidationHandler.ruleToAvailFlag(rule);
	}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		if (this.availFlag === 0) {
			return this.nextHandler?.validate(deck) ?? null;
		}

		for (const card of deck.allCards) {
			const error = this.checkAvail(card);
			if (error) {
				return error;
			}
		}

		return this.nextHandler?.validate(deck) ?? null;
	}

	private checkAvail(card: Card): DeckError | null {
		const ot = card.variant;
		const code = Number(card.code);

		if (ot & ScopeCode.ANIME) {
			return null;
		}

		if ((ot & this.availFlag) === this.availFlag) {
			return null;
		}

		if (ot & ScopeCode.OCG && this.availFlag !== ScopeCode.OCG) {
			return new OCGCardError(code);
		}

		if (ot & ScopeCode.TCG && this.availFlag !== ScopeCode.TCG) {
			return new TCGCardError(code);
		}

		return new NotOfficialCardError(code);
	}

	private static ruleToAvailFlag(rule: Rule): number {
		switch (rule) {
			case Rule.ONLY_OCG:
				return ScopeCode.OCG;
			case Rule.ONLY_TCG:
				return ScopeCode.TCG;
			case Rule.OCG_TCG:
			case Rule.PRE_RELEASE:
				return ScopeCode.OCG_TCG;
			case Rule.ALL:
				return 0;
			default:
				return 0;
		}
	}
}
