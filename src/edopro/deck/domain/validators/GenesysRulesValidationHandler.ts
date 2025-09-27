import { BanList } from "@edopro/ban-list/domain/BanList";
import { CardTypes } from "@edopro/card/domain/CardTypes";
import genesys from "genesys.json";

import { Deck } from "../Deck";
import { BanListDeckError } from "../errors/BanListDeckError";
import { DeckError } from "../errors/DeckError";
import { MainDeckLimitError } from "../errors/MainDeckLimitError";
import { DeckValidationHandler } from "./DeckValidationHandler";

export class GenesysRulesValidationHandler implements DeckValidationHandler {
	private readonly banList: BanList;
	private readonly nextHandler: DeckValidationHandler | null = null;
	private readonly genesysMap = new Map(genesys.map((item) => [item.code.toString(), item.points]));

	constructor(private readonly maxDeckPoints: number) {}

	setNextHandler(handler: DeckValidationHandler): DeckValidationHandler {
		throw new Error("Method not implemented.");
	}

	validate(deck: Deck): DeckError | null {
		for (const card of deck.allCards) {
			if (card.type & (CardTypes.TYPE_PENDULUM | CardTypes.TYPE_LINK)) {
				return new BanListDeckError(Number(card.code));
			}

			if (card.variant === 8) {
				return new BanListDeckError(Number(card.code));
			}
		}

		const points = deck.allCards.reduce((sum, card) => {
			const cardPoint =
				this.genesysMap.get(card.code) ?? (card.alias ? this.genesysMap.get(card.alias) : 0) ?? 0;

			return sum + cardPoint;
		}, 0);

		if (points > this.maxDeckPoints) {
			return new MainDeckLimitError(points, 0, this.maxDeckPoints);
		}

		return this.nextHandler?.validate(deck) ?? null;
	}
}
