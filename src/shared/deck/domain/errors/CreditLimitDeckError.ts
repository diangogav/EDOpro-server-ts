import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

/**
 * A deck spends more of a category's allowance than the list permits.
 *
 * Reported as CARD_BANLISTED: it is the only "this card may not be in this deck"
 * verdict the ygopro wire protocol carries, so clients can point at the card.
 */
export class CreditLimitDeckError extends DeckError {
	constructor(cardId: number, spent: number, allowed: number) {
		super({ type: DeckErrorType.CARD_BANLISTED, code: cardId, got: spent, min: 0, max: allowed });
	}
}
