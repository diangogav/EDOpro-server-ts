/**
 * A concrete place at the duel table: a position and the team it belongs to.
 */
export class Seat {
	constructor(
		public readonly position: number,
		public readonly team: number,
	) {}
}
