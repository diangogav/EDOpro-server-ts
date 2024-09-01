import { Card, ScopeCode } from "../../../card/domain/Card";
import { DeckRules, Rule } from "../../../room/domain/Room";
import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { NotOfficialCardError } from "../errors/NotOfficialCardError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class PrereleaseValidationHandler implements DeckValidationHandler {
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
		return !(this.deckRules.rule === Rule.PRE_RELEASE && (card.variant & ScopeCode.OFFICIAL) === 0);
	}
}
