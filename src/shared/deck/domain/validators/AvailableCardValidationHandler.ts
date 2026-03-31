import { BanList } from "@shared/ban-list/BanList";
import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { UnknownCardError } from "../errors/UnknownCardError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class AvailableCardValidationHandler implements DeckValidationHandler {
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
		if (!this.banList.isWhiteListed) {
			return null;
		}

		const availableCards = new Set([
			...this.banList.limited,
			...this.banList.semiLimited,
			...this.banList.forbidden,
			...this.banList.all,
		]);

		if (availableCards.size > 0) {
			for (const card of deck.allCards) {
				const code = Number(card.code);
				const alias = Number(card.alias);
				if (!availableCards.has(code) && (alias === 0 || !availableCards.has(alias))) {
					return new UnknownCardError(code);
				}
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
