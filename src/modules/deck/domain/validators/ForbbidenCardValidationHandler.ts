import { BanList } from "../../../ban-list/domain/BanList";
import { Deck } from "../Deck";
import { BanListDeckError } from "../errors/BanListDeckError";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class ForbiddenCardValidationHandler implements DeckValidationHandler {
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

		for (const forbiddenCard of this.banList.forbidden) {
			const count = cards.get(forbiddenCard) ?? 0;
			if (count > 0) {
				return new BanListDeckError(forbiddenCard);
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
