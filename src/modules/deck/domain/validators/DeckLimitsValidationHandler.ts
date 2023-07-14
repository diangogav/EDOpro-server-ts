import { DeckRules } from "../../../room/domain/Room";
import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { ExtraDeckLimitError } from "../errors/ExtraDeckLimitError";
import { MainDeckLimitError } from "../errors/MainDeckLimitError";
import { SideDeckLimitError } from "../errors/SideDeckLimitError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class DeckLimitsValidationHandler implements DeckValidationHandler {
	private readonly deckRules: DeckRules;
	private nextHandler: DeckValidationHandler | null = null;

	constructor(deckRules: DeckRules) {
		this.deckRules = deckRules;
	}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		if (deck.main.length > this.deckRules.mainMax || deck.main.length < this.deckRules.mainMin) {
			return new MainDeckLimitError(
				deck.main.length,
				this.deckRules.mainMin,
				this.deckRules.mainMax
			);
		}

		if (deck.side.length > this.deckRules.sideMax || deck.side.length < this.deckRules.sideMin) {
			return new SideDeckLimitError(
				deck.side.length,
				this.deckRules.sideMin,
				this.deckRules.sideMax
			);
		}

		if (
			deck.extra.length > this.deckRules.extraMax ||
			deck.extra.length < this.deckRules.extraMin
		) {
			return new ExtraDeckLimitError(
				deck.extra.length,
				this.deckRules.extraMin,
				this.deckRules.extraMax
			);
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
