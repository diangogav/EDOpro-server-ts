import { Deck } from "@shared/deck/domain/Deck";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { DeckRules } from "@shared/room/domain/YgoRoom";
import { DeckLimitsValidationHandler } from "@shared/deck/domain/validators/DeckLimitsValidationHandler";
import { ForbiddenCardValidationHandler } from "@shared/deck/domain/validators/ForbbidenCardValidationHandler";
import { SemiLimitedCardValidationHandler } from "@shared/deck/domain/validators/SemiLimitedCardValidationHandler";
import { LimitedCardValidationHandler } from "@shared/deck/domain/validators/LimitedCardValidationHandler";
import { NoLimitedCardValidationHandler } from "@shared/deck/domain/validators/NoLimitedCardValidationHandler";
import { AvailableCardValidationHandler } from "@shared/deck/domain/validators/AvailableCardValidationHandler";
import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import { CardAvailabilityValidationHandler } from "./validators/CardAvailabilityValidationHandler";

/**
 * Deck validator for Mercury flow, aligned with srvpro2's checkDeck logic.
 *
 * Uses the same Chain of Responsibility pattern as shared/Deck.validate()
 * but replaces the Multirole-aligned scope validators
 * (OfficialCardValidationHandler, DeckRuleValidationHandler, PrereleaseValidationHandler)
 * with a single CardAvailabilityValidationHandler that uses srvpro2's bitwise logic.
 */
export class YGOProDeckValidator {
	constructor(
		private readonly deckRules: DeckRules,
		private readonly banList: EdoproBanList,
	) { }

	validate(deck: Deck): DeckError | null {
		const chain = new DeckLimitsValidationHandler(this.deckRules);

		chain
			.setNextHandler(new ForbiddenCardValidationHandler(this.banList))
			.setNextHandler(new SemiLimitedCardValidationHandler(this.banList))
			.setNextHandler(new LimitedCardValidationHandler(this.banList))
			.setNextHandler(new CardAvailabilityValidationHandler(this.deckRules.rule))
			.setNextHandler(new NoLimitedCardValidationHandler(this.banList))
			.setNextHandler(new AvailableCardValidationHandler(this.banList));

		return chain.validate(deck);
	}
}
