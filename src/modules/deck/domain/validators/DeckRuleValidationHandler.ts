import { Card, ScopeCode } from "../../../card/domain/Card";
import { DeckRules, Rule } from "../../../room/domain/Room";
import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { OCGCardError } from "../errors/OCGCardError";
import { TCGCardError } from "../errors/TCGCardError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class DeckRuleValidationHandler implements DeckValidationHandler {
	private readonly deckRules: DeckRules;
	private nextHandler: DeckValidationHandler | null = null;

	constructor(deckRules: DeckRules) {
		this.deckRules = deckRules;
	}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		for (const card of deck.allCards) {
			if (this.deckRules.rule === Rule.ONLY_OCG) {
				if (!this.isValidOCG(card)) {
					return new OCGCardError(Number(card.code));
				}
			} else if (this.deckRules.rule === Rule.ONLY_TCG) {
				if (!this.isValidTCG(card)) {
					return new TCGCardError(Number(card.code));
				}
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}

	private isValidOCG(card: Card): boolean {
		return !(this.deckRules.rule === Rule.ONLY_OCG && (card.variant & ScopeCode.OCG) === 0);
	}

	private isValidTCG(card: Card): boolean {
		return !(this.deckRules.rule === Rule.ONLY_TCG && (card.variant & ScopeCode.TCG) === 0);
	}
}
