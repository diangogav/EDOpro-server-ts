import { Team } from "../../../room/domain/Team";
import { Rank } from "../../value-objects/Rank";
import { PlayerData } from "./PlayerData";

export type PlayerMatchSummary = {
	team: Team;
	name: string;
	winner: boolean;
	games: { result: "winner" | "loser" | "deuce"; turns: number }[];
	ranks: Rank[];
	points?: { [key: string]: number };
	score: number;
};

export class Player {
	public readonly name: string;
	public readonly team: Team;
	public readonly winner: boolean;
	public readonly ranks: Rank[];
	private _points: { [key: string]: number } = {};
	private readonly _games: { result: "winner" | "loser" | "deuce"; turns: number }[];
	private readonly score: number;

	constructor({ ranks, name, team, winner, games, score }: PlayerData) {
		this.ranks = ranks;
		this.name = name;
		this.team = team;
		this.winner = winner;
		this._games = games;
		this.score = score;
	}

	get globalRank(): Rank {
		const rank = this.ranks.find((item) => item.name === "Global");
		if (!rank) {
			throw new Error("Global rank not found");
		}

		return rank;
	}

	getBanListRank(name: string): Rank {
		const rank = this.ranks.find((item) => item.name === name);
		if (!rank) {
			throw new Error(`Rank ${name} not found`);
		}

		return rank;
	}

	recordPoints(rankName: string, points: number): void {
		this._points[rankName] = points;
	}

	get wins(): number {
		return this._games.filter((game) => game.result === "winner").length;
	}

	get losses(): number {
		return this._games.filter((game) => game.result === "loser").length;
	}

	toPresentation(): PlayerMatchSummary {
		return {
			team: this.team,
			name: this.name,
			winner: this.winner,
			games: this._games,
			ranks: this.ranks,
			points: this._points,
			score: this.score,
		};
	}
}
