export class DuelResume {
	readonly id: string;
	readonly userId: string;
	readonly playerNames: string[];
	readonly opponentNames: string[];
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
		playerNames,
		opponentNames,
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
		playerNames: string[];
		opponentNames: string[];
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
		this.playerNames = playerNames;
		this.opponentNames = opponentNames;
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
		playerNames,
		opponentNames,
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
		playerNames: string[];
		opponentNames: string[];
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
			playerNames,
			opponentNames,
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
		playerNames: string[];
		opponentNames: string[];
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
