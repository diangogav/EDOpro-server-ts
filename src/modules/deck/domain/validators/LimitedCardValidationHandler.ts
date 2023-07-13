import { BanList } from "../../../ban-list/domain/BanList";
import { Deck } from "../Deck";
import { BanListDeckError } from "../errors/BanListDeckError";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class LimitedCardValidationHandler implements DeckValidationHandler {
	private readonly banList: BanList;
	private nextHandler: DeckValidationHandler | null = null;

	constructor(banList: BanList) {
		this.banList = banList;
	}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		const cards: Map<number, number> = new Map();

		for (const cardId of deck.allCards) {
			const count = cards.get(cardId) ?? 0;
			cards.set(cardId, count + 1);
		}

		for (const limitedCard of this.banList.limited) {
			const count = cards.get(limitedCard) ?? 0;
			if (count > 1) {
				return new BanListDeckError(limitedCard);
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
