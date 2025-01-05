import { randomUUID } from "crypto";

export type PlayerStatsProperties = {
	id: string;
	banListName: string;
	wins: number;
	losses: number;
	points: number;
	userId: string;
	season: number;
};

export class PlayerStats {
	public readonly id: string;
	public readonly banListName: string;
	public readonly userId: string;
	public readonly season: number;
	private _points: number;
	private _wins: number;
	private _losses: number;

	private constructor(data: PlayerStatsProperties) {
		this.id = data.id;
		this.banListName = data.banListName;
		this._wins = data.wins;
		this._losses = data.losses;
		this._points = data.points;
		this.userId = data.userId;
		this.season = data.season;
	}

	get points(): number {
		return this._points;
	}

	get wins(): number {
		return this._wins;
	}

	get losses(): number {
		return this._losses;
	}

	static initialize(data: { banListName: string; userId: string; season: number }): PlayerStats {
		return new PlayerStats({ ...data, wins: 0, losses: 0, points: 0, id: randomUUID() });
	}

	static from(data: PlayerStatsProperties): PlayerStats {
		return new PlayerStats(data);
	}

	addPoints(points: number): void {
		this._points += points;
		if (this._points <= 0) {
			this._points = 0;
		}
	}

	increaseWins(): void {
		this._wins++;
	}

	increaseLosses(): void {
		this._losses++;
	}
}
