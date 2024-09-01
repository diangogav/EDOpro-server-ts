import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class ExtraDeckLimitError extends DeckError {
	constructor(got: number, min: number, max: number) {
		super({ type: DeckErrorType.DECK_BAD_EXTRA_COUNT, got, min, max });
	}
}
