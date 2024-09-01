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

		for (const card of deck.allCards) {
			const count = cards.get(Number(card.code)) ?? 0;
			if (Number(card.alias)) {
				const count = cards.get(Number(card.alias)) ?? 0;
				cards.set(Number(card.alias), count + 1);
			}
			cards.set(Number(card.code), count + 1);
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
