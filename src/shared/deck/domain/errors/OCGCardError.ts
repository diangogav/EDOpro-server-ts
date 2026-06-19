import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class OCGCardError extends DeckError {
	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_OCG_ONLY, code: cardId, got: 0, min: 0, max: 0 });
	}
}
