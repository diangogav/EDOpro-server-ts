import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class MainDeckLimitError extends DeckError {
	constructor(got: number, min: number, max: number) {
		super({ type: DeckErrorType.DECK_BAD_MAIN_COUNT, got, min, max });
	}
}
