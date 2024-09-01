import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class SideDeckLimitError extends DeckError {
	constructor(got: number, min: number, max: number) {
		super({ type: DeckErrorType.DECK_BAD_SIDE_COUNT, got, min, max });
	}
}
