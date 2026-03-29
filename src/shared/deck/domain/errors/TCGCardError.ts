import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class TCGCardError extends DeckError {
	private readonly cardId: number;

	constructor(cardId: number) {
		super({ type: DeckErrorType.CARD_TCG_ONLY, code: cardId, got: 0, min: 0, max: 0 });
		this.cardId = cardId;
	}
}
