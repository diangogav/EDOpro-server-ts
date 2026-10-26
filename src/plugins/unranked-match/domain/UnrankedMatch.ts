export interface UnrankedMatchData {
	readonly id: string;
	readonly gameId: string;
	readonly bestOf: number;
	readonly playerNames: string[];
	readonly opponentNames: string[];
	/** Ids of the registered players on each side; guests have none and are left out. */
	readonly playerIds: string[];
	readonly opponentIds: string[];
	/** Handshake client per player, aligned with the names; "" when a player sent none. */
	readonly playerClients: string[];
	readonly opponentClients: string[];
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
