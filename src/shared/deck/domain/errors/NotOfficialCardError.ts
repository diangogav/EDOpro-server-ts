import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class NotOfficialCardError extends DeckError {
	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_UNOFFICIAL, code: cardId, got: 0, min: 0, max: 0 });
	}
}
