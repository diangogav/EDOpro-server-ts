import { BanList } from "../../../ban-list/domain/BanList";
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
		const availableCards = [
			...this.banList.limited,
			...this.banList.semiLimited,
			...this.banList.forbidden,
			...this.banList.all,
		];

		if (availableCards.length > 0) {
			for (const card of deck.allCards) {
				if (
					!availableCards.find(
						(availableCard) =>
							availableCard === Number(card.code) ||
							(Number(card.alias) !== 0 && availableCard === Number(card.alias))
					)
				) {
					return new UnknownCardError(Number(card.code));
				}
			}
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
