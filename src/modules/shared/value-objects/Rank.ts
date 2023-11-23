export class Rank {
	readonly name: string;
	readonly position: number;
	readonly points: number;

	constructor({ name, position, points }: { name: string; position: number; points: number }) {
		this.name = name;
		this.position = position;
		this.points = points;
	}
}
