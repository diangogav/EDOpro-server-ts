export class Rank {
	readonly name: string;
	readonly value: number;

	constructor({ name, value }: { name: string; value: number }) {
		this.name = name;
		this.value = value;
	}
}
