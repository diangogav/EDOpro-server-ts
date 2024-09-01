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

		for (const card of deck.allCards) {
			const count = cards.get(Number(card.code)) ?? 0;
			if (Number(card.alias)) {
				const count = cards.get(Number(card.alias)) ?? 0;
				cards.set(Number(card.alias), count + 1);
			}
			cards.set(Number(card.code), count + 1);
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
