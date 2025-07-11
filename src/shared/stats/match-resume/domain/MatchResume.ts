export class MatchResume {
	readonly id: string;
	readonly userId: string;
	readonly bestOf: number;
	readonly playerNames: string[];
	readonly opponentNames: string[];
	readonly playerIds: string[];
	readonly opponentIds: string[];
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly playerScore: number;
	readonly opponentScore: number;
	readonly winner: boolean;
	readonly season: number;
	readonly points: number;

	private constructor({
		id,
		userId,
		bestOf,
		playerNames,
		opponentNames,
		date,
		banListName,
		banListHash,
		playerScore,
		opponentScore,
		winner,
		season,
		points,
		playerIds,
		opponentIds,
	}: {
		id: string;
		userId: string;
		bestOf: number;
		playerNames: string[];
		opponentNames: string[];
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
		points: number;
		playerIds: string[];
		opponentIds: string[];
	}) {
		this.id = id;
		this.userId = userId;
		this.bestOf = bestOf;
		this.playerNames = playerNames;
		this.opponentNames = opponentNames;
		this.date = date;
		this.banListName = banListName;
		this.banListHash = banListHash;
		this.playerScore = playerScore;
		this.opponentScore = opponentScore;
		this.winner = winner;
		this.season = season;
		this.points = points;
		this.playerIds = playerIds;
		this.opponentIds = opponentIds;
	}

	static create({
		id,
		userId,
		bestOf,
		playerNames,
		opponentNames,
		date,
		banListName,
		banListHash,
		playerScore,
		opponentScore,
		winner,
		season,
		points,
		playerIds,
		opponentIds,
	}: {
		id: string;
		userId: string;
		bestOf: number;
		playerNames: string[];
		opponentNames: string[];
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
		points: number;
		playerIds: string[];
		opponentIds: string[];
	}): MatchResume {
		return new MatchResume({
			id,
			userId,
			bestOf,
			playerNames,
			opponentNames,
			date,
			banListName,
			banListHash,
			playerScore,
			opponentScore,
			winner,
			season,
			points,
			playerIds,
			opponentIds,
		});
	}

	static from(data: {
		id: string;
		userId: string;
		bestOf: number;
		playerNames: string[];
		opponentNames: string[];
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
		points: number;
		playerIds: string[];
		opponentIds: string[];
	}): MatchResume {
		return new MatchResume(data);
	}
}
