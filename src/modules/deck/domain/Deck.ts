import { BanList } from "../../ban-list/domain/BanList";
import { DeckRules } from "../../room/domain/Room";
import { DeckError } from "./errors/DeckError";
import { DeckLimitsValidationHandler } from "./validators/DeckLimitsValidationHandler";
import { ForbiddenCardValidationHandler } from "./validators/ForbbidenCardValidationHandler";
import { LimitedCardValidationHandler } from "./validators/LimitedCardValidationHandler";
import { SemiLimitedCardValidationHandler } from "./validators/SemiLimitedCardValidationHandler";

export class Deck {
	readonly main: number[];
	readonly side: number[];
	readonly extra: number[];
	private readonly banList: BanList;
	private readonly deckRules: DeckRules;

	constructor({
		main = [],
		side = [],
		extra = [],
		banList,
		deckRules,
	}: {
		main?: number[];
		side?: number[];
		extra?: number[];
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

	get allCards(): number[] {
		return [...this.main, ...this.side, ...this.extra];
	}

	public validate(): DeckError | null {
		const handleValidations = new DeckLimitsValidationHandler(this.deckRules);

		handleValidations
			.setNextHandler(new ForbiddenCardValidationHandler(this.banList))
			.setNextHandler(new SemiLimitedCardValidationHandler(this.banList))
			.setNextHandler(new LimitedCardValidationHandler(this.banList));

		return handleValidations.validate(this);
	}
}
