import { BanList } from "../../../ban-list/domain/BanList";
import { Deck } from "../Deck";
import { BanListDeckError } from "../errors/BanListDeckError";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class SemiLimitedCardValidationHandler implements DeckValidationHandler {
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

		for (const semilimitedCard of this.banList.semiLimited) {
			const count = cards.get(semilimitedCard) ?? 0;
			if (count > 2) {
				return new BanListDeckError(semilimitedCard);
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
