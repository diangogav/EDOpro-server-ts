import { BanList } from "@shared/ban-list/BanList";
import { Deck } from "../Deck";
import { CreditLimitDeckError } from "../errors/CreditLimitDeckError";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

/**
 * Enforces a list's credit limits — an allowance shared across a GROUP of cards,
 * rather than a per-card copy cap.
 *
 * Rush Duel's Legend rule is the case this exists for: a deck may carry one
 * Legend monster, one Legend spell and one Legend trap. Not one copy of each —
 * one card out of the ~70 that carry the mark, so Blue-Eyes and Dark Magician
 * cannot share a deck, and two copies of either are just as illegal.
 */
export class CreditLimitValidationHandler implements DeckValidationHandler {
	private nextHandler: DeckValidationHandler | null = null;

	constructor(private readonly banList: BanList) {}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		for (const [, limit] of this.banList.creditLimits) {
			let spent = 0;
			let offender: number | null = null;

			for (const card of deck.allCards) {
				const credit = limit.cards.get(Number(card.code));
				if (credit === undefined) continue;

				spent += credit;
				if (spent > limit.cap) {
					offender = Number(card.code);
					break;
				}
			}

			if (offender !== null) {
				return new CreditLimitDeckError(offender, spent, limit.cap);
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
