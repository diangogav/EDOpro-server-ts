export class DuelResume {
	readonly id: string;
	readonly userId: string;
	readonly playerName: string;
	readonly opponentName: string;
	readonly date: Date;
	readonly banListName: string;
	readonly banListHash: string;
	readonly result: string;
	readonly turns: number;
	readonly matchId: string;
	readonly season: number;

	private constructor({
		id,
		userId,
		playerName,
		opponentName,
		date,
		banListName,
		banListHash,
		result,
		turns,
		matchId,
		season,
	}: {
		id: string;
		userId: string;
		playerName: string;
		opponentName: string;
		date: Date;
		banListName: string;
		banListHash: string;
		result: string;
		turns: number;
		matchId: string;
		season: number;
	}) {
		this.id = id;
		this.userId = userId;
		this.playerName = playerName;
		this.opponentName = opponentName;
		this.date = date;
		this.banListName = banListName;
		this.banListHash = banListHash;
		this.result = result;
		this.turns = turns;
		this.matchId = matchId;
		this.season = season;
	}

	static create({
		id,
		userId,
		playerName,
		opponentName,
		date,
		banListName,
		banListHash,
		result,
		turns,
		matchId,
		season,
	}: {
		id: string;
		userId: string;
		playerName: string;
		opponentName: string;
		date: Date;
		banListName: string;
		banListHash: string;
		result: string;
		turns: number;
		matchId: string;
		season: number;
	}): DuelResume {
		return new DuelResume({
			id,
			userId,
			playerName,
			opponentName,
			date,
			banListName,
			banListHash,
			result,
			turns,
			matchId,
			season,
		});
	}

	static from(data: {
		id: string;
		userId: string;
		playerName: string;
		opponentName: string;
		date: Date;
		banListName: string;
		banListHash: string;
		result: string;
		turns: number;
		matchId: string;
		season: number;
	}): DuelResume {
		return new DuelResume(data);
	}
}
