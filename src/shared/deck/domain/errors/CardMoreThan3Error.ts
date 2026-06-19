import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class CardMoreThan3Error extends DeckError {
	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_MORE_THAN_3, code: cardId, got: 0, min: 0, max: 0 });
	}
}
