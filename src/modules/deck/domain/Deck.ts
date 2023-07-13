import { BanList } from "../../ban-list/domain/BanList";
import { DeckError } from "./errors/DeckError";
import { ForbiddenCardValidationHandler } from "./validators/ForbbidenCardValidationHandler";
import { LimitedCardValidationHandler } from "./validators/LimitedCardValidationHandler";
import { SemiLimitedCardValidationHandler } from "./validators/SemiLimitedCardValidationHandler";

export class Deck {
	readonly main: number[];
	readonly side: number[];
	readonly extra: number[];
	private readonly banList: BanList;

	constructor({
		main = [],
		side = [],
		extra = [],
		banList,
	}: {
		main?: number[];
		side?: number[];
		extra?: number[];
		banList: BanList;
	}) {
		this.main = main;
		this.side = side;
		this.extra = extra;
		this.banList = banList;
		this.validate();
	}

	isSideDeckValid(mainDeck: number[]): boolean {
		return mainDeck.length === this.main.length + this.extra.length;
	}

	get allCards(): number[] {
		return [...this.main, ...this.side, ...this.extra];
	}

	public validate(): DeckError | null {
		const handleValidations = new ForbiddenCardValidationHandler(this.banList);

		handleValidations
			.setNextHandler(new SemiLimitedCardValidationHandler(this.banList))
			.setNextHandler(new LimitedCardValidationHandler(this.banList));

		return handleValidations.validate(this);
	}
}
