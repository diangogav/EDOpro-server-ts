import { DeckRules } from "@shared/room/domain/YgoRoom";
import { EdoproBanList } from "../../../edopro/ban-list/domain/BanList";
import { DeckError } from "./errors/DeckError";
import { AvailableCardValidationHandler } from "./validators/AvailableCardValidationHandler";
import { DeckLimitsValidationHandler } from "./validators/DeckLimitsValidationHandler";
import { DeckRuleValidationHandler } from "./validators/DeckRuleValidationHandler";
import { ForbiddenCardValidationHandler } from "./validators/ForbbidenCardValidationHandler";
import { GenesysRulesValidationHandler } from "./validators/GenesysRulesValidationHandler";
import { LimitedCardValidationHandler } from "./validators/LimitedCardValidationHandler";
import { NoLimitedCardValidationHandler } from "./validators/NoLimitedCardValidationHandler";
import { OfficialCardValidationHandler } from "./validators/OfficialCardsValidationHandler";
import { PrereleaseValidationHandler } from "./validators/PrereleaseValidationHandler";
import { SemiLimitedCardValidationHandler } from "./validators/SemiLimitedCardValidationHandler";
import { Card } from "@shared/card/domain/Card";

export class Deck {
	readonly main: Card[];
	readonly side: Card[];
	readonly extra: Card[];
	private readonly banList: EdoproBanList;
	private readonly deckRules: DeckRules;

	constructor({
		main = [],
		side = [],
		extra = [],
		banList,
		deckRules,
	}: {
		main?: Card[];
		side?: Card[];
		extra?: Card[];
		banList: EdoproBanList;
		deckRules: DeckRules;
	}) {
		this.main = main;
		this.side = side;
		this.extra = extra;
		this.banList = banList;
		this.deckRules = deckRules;
	}

	isSideDeckValid(newMain: number[], newSide: number[]): boolean {
		const oldCounts = new Map<number, number>();
		const newCounts = new Map<number, number>();

		for (const card of this.allCards) {
			const code = Number(card.code);
			oldCounts.set(code, (oldCounts.get(code) ?? 0) + 1);
		}

		for (const code of [...newMain, ...newSide]) {
			newCounts.set(code, (newCounts.get(code) ?? 0) + 1);
		}

		if (oldCounts.size !== newCounts.size) {
			return false;
		}

		for (const [code, count] of oldCounts) {
			if (newCounts.get(code) !== count) {
				return false;
			}
		}

		return true;
	}

	get allCards(): Card[] {
		return [...this.main, ...this.side, ...this.extra];
	}

	public validate(): DeckError | null {
		const handleValidations = new DeckLimitsValidationHandler(this.deckRules);

		if (!this.banList.isGenesys()) {
			handleValidations

				.setNextHandler(new ForbiddenCardValidationHandler(this.banList))
				.setNextHandler(new SemiLimitedCardValidationHandler(this.banList))
				.setNextHandler(new LimitedCardValidationHandler(this.banList))
				.setNextHandler(new DeckRuleValidationHandler(this.deckRules))
				.setNextHandler(new OfficialCardValidationHandler(this.deckRules))
				.setNextHandler(new PrereleaseValidationHandler(this.deckRules))
				.setNextHandler(new NoLimitedCardValidationHandler(this.banList))
				.setNextHandler(new AvailableCardValidationHandler(this.banList));
		} else {
			handleValidations
				.setNextHandler(new DeckRuleValidationHandler(this.deckRules))
				.setNextHandler(new OfficialCardValidationHandler(this.deckRules))
				.setNextHandler(new PrereleaseValidationHandler(this.deckRules))
				.setNextHandler(new NoLimitedCardValidationHandler(this.banList))
				.setNextHandler(new GenesysRulesValidationHandler(this.deckRules.maxDeckPoints));
		}

		return handleValidations.validate(this);
	}
}
