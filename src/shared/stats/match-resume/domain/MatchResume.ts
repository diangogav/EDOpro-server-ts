export class MatchResume {
	readonly id: string;
	readonly userId: string;
	readonly bestOf: number;
	readonly playerName: string;
	readonly opponentName: string;
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly playerScore: number;
	readonly opponentScore: number;
	readonly winner: boolean;
	readonly season: number;

	private constructor({
		id,
		userId,
		bestOf,
		playerName,
		opponentName,
		date,
		banListName,
		banListHash,
		playerScore,
		opponentScore,
		winner,
		season,
	}: {
		id: string;
		userId: string;
		bestOf: number;
		playerName: string;
		opponentName: string;
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
	}) {
		this.id = id;
		this.userId = userId;
		this.bestOf = bestOf;
		this.playerName = playerName;
		this.opponentName = opponentName;
		this.date = date;
		this.banListName = banListName;
		this.banListHash = banListHash;
		this.playerScore = playerScore;
		this.opponentScore = opponentScore;
		this.winner = winner;
		this.season = season;
	}

	static create({
		id,
		userId,
		bestOf,
		playerName,
		opponentName,
		date,
		banListName,
		banListHash,
		playerScore,
		opponentScore,
		winner,
		season,
	}: {
		id: string;
		userId: string;
		bestOf: number;
		playerName: string;
		opponentName: string;
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
	}): MatchResume {
		return new MatchResume({
			id,
			userId,
			bestOf,
			playerName,
			opponentName,
			date,
			banListName,
			banListHash,
			playerScore,
			opponentScore,
			winner,
			season,
		});
	}

	static from(data: {
		id: string;
		userId: string;
		bestOf: number;
		playerName: string;
		opponentName: string;
		date: Date;
		banListName: string;
		banListHash: string;
		playerScore: number;
		opponentScore: number;
		winner: boolean;
		season: number;
	}): MatchResume {
		return new MatchResume(data);
	}
}
