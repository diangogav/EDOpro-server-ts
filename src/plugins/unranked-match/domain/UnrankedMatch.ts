export interface UnrankedMatchData {
	readonly id: string;
	readonly gameId: string;
	readonly bestOf: number;
	readonly playerNames: string[];
	readonly opponentNames: string[];
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly team0Score: number;
	readonly team1Score: number;
	readonly winnerTeam: number;
	readonly season: number;
}

export class UnrankedMatch {
	private constructor(readonly data: UnrankedMatchData) {}

	static create(data: UnrankedMatchData): UnrankedMatch {
		return new UnrankedMatch(data);
	}
}
