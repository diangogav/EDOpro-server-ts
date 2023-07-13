import { BanList } from "../../../ban-list/domain/BanList";
import { Deck } from "../Deck";
import { BanListDeckError } from "../errors/BanListDeckError";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class DeckServerCardsValidationHandler implements DeckValidationHandler {
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
		for (const cardId of deck.allCards) {
			if (!this.banList.all.includes(cardId)) {
				return new BanListDeckError(cardId);
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
