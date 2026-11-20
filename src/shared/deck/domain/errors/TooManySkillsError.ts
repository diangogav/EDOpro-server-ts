import { DeckError } from "./DeckError";
import { DeckErrorType } from "./DeckErrorType";

export class TooManySkillsError extends DeckError {
	constructor() {
		super({ type: DeckErrorType.DECK_TOO_MANY_SKILLS });
	}
}
