export type RankAttributes = {
	name: string;
	position: number;
	points: number;
};

export class Rank {
	readonly name: string;
	readonly position: number;
	readonly points: number;

	constructor({ name, position, points }: RankAttributes) {
		this.name = name;
		this.position = position;
		this.points = points;
	}
}
