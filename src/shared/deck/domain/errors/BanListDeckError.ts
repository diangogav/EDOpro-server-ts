import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class BanListDeckError extends DeckError {
	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_BANLISTED, code: cardId, got: 0, min: 0, max: 0 });
	}
}
