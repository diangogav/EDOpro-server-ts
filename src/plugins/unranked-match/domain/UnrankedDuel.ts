export interface UnrankedDuelData {
	readonly id: string;
	readonly gameId: string;
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly team0Score: number;
	readonly team1Score: number;
	readonly winnerTeam: number;
	readonly turns: number;
	readonly matchId: string;
	readonly season: number;
	readonly ipAddress: string | null;
}

export class UnrankedDuel {
	private constructor(readonly data: UnrankedDuelData) {}

	static create(data: UnrankedDuelData): UnrankedDuel {
		return new UnrankedDuel(data);
	}
}
