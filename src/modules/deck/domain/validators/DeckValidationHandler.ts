import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";

export interface DeckValidationHandler {
	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler;
	validate(deck: Deck): DeckError | null;
}
