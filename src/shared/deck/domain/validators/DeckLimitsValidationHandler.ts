import { DeckRules } from "@shared/room/domain/YgoRoom";
import { Deck } from "../Deck";
import { DeckError } from "../errors/DeckError";
import { ExtraDeckLimitError } from "../errors/ExtraDeckLimitError";
import { MainDeckLimitError } from "../errors/MainDeckLimitError";
import { SideDeckLimitError } from "../errors/SideDeckLimitError";
import { skillCount } from "../SkillCards";
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
		// A Skill is sent in the Main Deck list without being one of its cards.
		// In the Side Deck it is a card like any other.
		const mainSize = deck.main.length - skillCount(deck.main);
		if (mainSize > this.deckRules.mainMax || mainSize < this.deckRules.mainMin) {
			return new MainDeckLimitError(mainSize, this.deckRules.mainMin, this.deckRules.mainMax);
		}

		if (deck.side.length > this.deckRules.sideMax || deck.side.length < this.deckRules.sideMin) {
			return new SideDeckLimitError(
				deck.side.length,
				this.deckRules.sideMin,
				this.deckRules.sideMax,
			);
		}

		if (
			deck.extra.length > this.deckRules.extraMax ||
			deck.extra.length < this.deckRules.extraMin
		) {
			return new ExtraDeckLimitError(
				deck.extra.length,
				this.deckRules.extraMin,
				this.deckRules.extraMax,
			);
		}

		if (this.nextHandler) {
			return this.nextHandler.validate(deck);
		}

		return null;
	}
}
