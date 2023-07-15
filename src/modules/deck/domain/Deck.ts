import { BanList } from "../../ban-list/domain/BanList";
import { Card } from "../../card/domain/Card";
import { DeckRules } from "../../room/domain/Room";
import { DeckError } from "./errors/DeckError";
import { AvailableCardValidationHandler } from "./validators/AvailableCardValidationHandler";
import { DeckLimitsValidationHandler } from "./validators/DeckLimitsValidationHandler";
import { DeckRuleValidationHandler } from "./validators/DeckRuleValidationHandler";
import { ForbiddenCardValidationHandler } from "./validators/ForbbidenCardValidationHandler";
import { LimitedCardValidationHandler } from "./validators/LimitedCardValidationHandler";
import { OfficialCardValidationHandler } from "./validators/OfficialCardsValidationHandler";
import { PrereleaseValidationHandler } from "./validators/PrereleaseValidationHandler";
import { SemiLimitedCardValidationHandler } from "./validators/SemiLimitedCardValidationHandler";

export class Deck {
	readonly main: Card[];
	readonly side: Card[];
	readonly extra: Card[];
	private readonly banList: BanList;
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
		banList: BanList;
		deckRules: DeckRules;
	}) {
		this.main = main;
		this.side = side;
		this.extra = extra;
		this.banList = banList;
		this.deckRules = deckRules;
		this.validate();
	}

	isSideDeckValid(mainDeck: number[]): boolean {
		return mainDeck.length === this.main.length + this.extra.length;
	}

	get allCards(): Card[] {
		return [...this.main, ...this.side, ...this.extra];
	}

	public validate(): DeckError | null {
		const handleValidations = new DeckLimitsValidationHandler(this.deckRules);

		handleValidations
			.setNextHandler(new ForbiddenCardValidationHandler(this.banList))
			.setNextHandler(new SemiLimitedCardValidationHandler(this.banList))
			.setNextHandler(new LimitedCardValidationHandler(this.banList))
			.setNextHandler(new DeckRuleValidationHandler(this.deckRules))
			.setNextHandler(new OfficialCardValidationHandler(this.deckRules))
			.setNextHandler(new PrereleaseValidationHandler(this.deckRules))
			.setNextHandler(new AvailableCardValidationHandler(this.banList));

		return handleValidations.validate(this);
	}
}
