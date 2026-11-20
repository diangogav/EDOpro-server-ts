import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { TooManySkillsError } from "../errors/TooManySkillsError";
import { MAX_SKILLS, skillCount } from "../SkillCards";
import { DeckValidationHandler } from "./DeckValidationHandler";

/**
 * A Skill travels in the Main Deck list, and a deck plays with one at most.
 * The Skills of the Side Deck are spares and are not limited here.
 */
export class SkillLimitValidationHandler implements DeckValidationHandler {
	private nextHandler: DeckValidationHandler | null = null;

	public setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	public validate(deck: Deck): DeckError | null {
		if (skillCount(deck.main) > MAX_SKILLS) {
			return new TooManySkillsError();
		}

		return this.nextHandler?.validate(deck) ?? null;
	}
}
