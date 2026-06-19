import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class TCGCardError extends DeckError {
	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_TCG_ONLY, code: cardId, got: 0, min: 0, max: 0 });
	}
}
