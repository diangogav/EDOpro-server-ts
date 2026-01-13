import { EdoproBanList } from "../../../ban-list/domain/BanList";
import { Deck } from "../Deck";
import { CardMoreThan3Error } from "../errors/CardMoreThan3Error";
import { DeckError } from "../errors/DeckError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class NoLimitedCardValidationHandler implements DeckValidationHandler {
	private readonly banList: EdoproBanList;
	private nextHandler: DeckValidationHandler | null = null;

	constructor(banList: EdoproBanList) {
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

		for (const card of this.banList.all) {
			const count = cards.get(card) ?? 0;

			if (count > 3) {
				return new CardMoreThan3Error(card);
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
