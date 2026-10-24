import { Card } from "@shared/card/domain/Card";
import { Deck } from "@shared/deck/domain/Deck";
import { DeckError } from "@shared/deck/domain/errors/DeckError";
import { NotOfficialCardError } from "@shared/deck/domain/errors/NotOfficialCardError";
import { OCGCardError } from "@shared/deck/domain/errors/OCGCardError";
import { TCGCardError } from "@shared/deck/domain/errors/TCGCardError";
import { DeckValidationHandler } from "@shared/deck/domain/validators/DeckValidationHandler";
import { AvailFlag, YGOProRule, availFlagFor } from "@ygopro/room/domain/host-info/YGOProRule";

/**
 * Card availability check for Mercury rooms.
 *
 * A card passes when its `ot` carries every bit the room's rule requires:
 * (cardOt & availFlag) === availFlag. Custom cards (0x4) always pass.
 */
export class CardAvailabilityValidationHandler implements DeckValidationHandler {
	private readonly availFlag: number;
	private nextHandler: DeckValidationHandler | null = null;

	constructor(rule: YGOProRule) {
		this.availFlag = availFlagFor(rule);
	}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		this.nextHandler = handler;

		return handler;
	}

	validate(deck: Deck): DeckError | null {
		if (this.availFlag === 0) {
			return this.nextHandler?.validate(deck) ?? null;
		}

		for (const card of deck.allCards) {
			const error = this.checkAvail(card);
			if (error) {
				return error;
			}
		}

		return this.nextHandler?.validate(deck) ?? null;
	}

	private checkAvail(card: Card): DeckError | null {
		const ot = card.variant;
		const code = Number(card.code);

		if (ot & AvailFlag.CUSTOM) {
			return null;
		}

		if ((ot & this.availFlag) === this.availFlag) {
			return null;
		}

		if (ot & AvailFlag.OCG && this.availFlag !== AvailFlag.OCG) {
			return new OCGCardError(code);
		}

		if (ot & AvailFlag.TCG && this.availFlag !== AvailFlag.TCG) {
			return new TCGCardError(code);
		}

		return new NotOfficialCardError(code);
	}
}
