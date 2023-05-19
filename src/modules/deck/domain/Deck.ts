export class Deck {
	readonly main: number[];
	readonly side: number[];

	constructor({ main = [], side = [] }: { main?: number[]; side?: number[] }) {
		this.main = main;
		this.side = side;
	}
}
