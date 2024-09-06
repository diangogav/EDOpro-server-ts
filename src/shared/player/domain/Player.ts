import { Team } from "../../room/Team";
import { PlayerData } from "./PlayerData";

export type PlayerMatchSummary = {
	team: Team;
	name: string;
	winner: boolean;
	games: { result: "winner" | "loser" | "deuce"; turns: number }[];
	points?: { [key: string]: number };
	score: number;
};

export type Game = { result: "winner" | "loser" | "deuce"; turns: number };

export class Player {
	public readonly name: string;
	public readonly team: Team;
	public readonly winner: boolean;
	private _points: { [key: string]: number } = {};
	private readonly _games: Game[];
	private readonly score: number;

	constructor({ name, team, winner, games, score }: PlayerData) {
		this.name = name;
		this.team = team;
		this.winner = winner;
		this._games = games;
		this.score = score;
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
			points: this._points,
			score: this.score,
		};
	}
}
