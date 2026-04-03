import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class CardMoreThan3Error extends DeckError {
	private readonly cardId: number;

	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_MORE_THAN_3, code: cardId, got: 0, min: 0, max: 0 });
		this.cardId = cardId;
	}
}
