import { Card, ScopeCode } from "../../../card/domain/Card";
import { DeckRules, Rule } from "../../../room/domain/Room";
import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { NotOfficialCardError } from "../errors/NotOfficialCardError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class OfficialCardValidationHandler implements DeckValidationHandler {
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
			if (!this.isAllowed(card)) {
				return new NotOfficialCardError(Number(card.code));
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}

	private isAllowed(card: Card): boolean {
		const rule = this.deckRules.rule;

		if (rule === Rule.OCG_TCG || rule === Rule.ONLY_OCG || rule === Rule.ONLY_TCG) {
			return card.variant < ScopeCode.OFFICIAL;
		}

		if (rule === Rule.PRE_RELEASE) {
			return (card.variant & ~ScopeCode.OFFICIAL) === 0;
		}

		return true;
	}
}
