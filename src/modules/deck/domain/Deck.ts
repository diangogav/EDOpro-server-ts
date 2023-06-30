export class Deck {
	readonly main: number[];
	readonly side: number[];
	readonly extra: number[];

	constructor({
		main = [],
		side = [],
		extra = [],
	}: {
		main?: number[];
		side?: number[];
		extra?: number[];
	}) {
		this.main = main;
		this.side = side;
		this.extra = extra;
	}

	isSideDeckValid(mainDeck: number[]): boolean {
		return mainDeck.length === this.main.length + this.extra.length;
	}
}
