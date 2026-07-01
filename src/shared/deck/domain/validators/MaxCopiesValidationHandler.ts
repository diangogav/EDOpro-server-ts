import { Deck } from "../Deck";
import { CardMoreThan3Error } from "../errors/CardMoreThan3Error";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

const MAX_COPIES = 3;

/**
 * Enforces the "3 copies max of any card" rule across the whole deck.
 *
 * Unlike NoLimitedCardValidationHandler (which only checks cards listed in the
 * ban list), this counts every distinct card. Alternate artworks share a card
 * identity, so copies are unified by alias: a card's canonical id is its alias
 * when present, otherwise its own code.
 */
export class MaxCopiesValidationHandler implements DeckValidationHandler {
	private nextHandler: DeckValidationHandler | null = null;

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		const counts = new Map<number, number>();

		for (const card of deck.allCards) {
			const canonicalId = Number(card.alias) || Number(card.code);
			counts.set(canonicalId, (counts.get(canonicalId) ?? 0) + 1);
		}

		for (const [canonicalId, count] of counts) {
			if (count > MAX_COPIES) {
				return new CardMoreThan3Error(canonicalId);
			}
		}

		return this.nextHandler?.validate(deck) ?? null;
	}
}
