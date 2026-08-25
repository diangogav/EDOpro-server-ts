import { randomUUID } from "crypto";

import { Team } from "./Team";

export class Duel {
	/**
	 * Stable identity of this single game. Room ids are 4-digit randoms that
	 * collide and get reused, and the turn counter resets per game — so
	 * (duelId, turn) is the only unambiguous key for anything that happens
	 * inside a duel.
	 */
	readonly duelId: string = randomUUID();

	private _turn: number;
	private readonly _lps: [number, number];
	private readonly _banListName: string;
	private _finished: boolean;

	constructor(turn: number, lps: [number, number], banListName: string | null) {
		this._turn = turn;
		this._lps = lps;
		this._banListName = banListName ?? "N/A";
		this._finished = false;
	}

	increaseTurn(): void {
		this._turn++;
	}

	decreaseLps(team: Team, value: number): void {
		if (team !== Team.OPPONENT && team !== Team.PLAYER) {
			return;
		}
		this._lps[team] = this._lps[team] - value;

		if (this._lps[team] <= 0) {
			this._lps[team] = 0;
		}
	}

	increaseLps(team: Team, value: number): void {
		if (team !== Team.OPPONENT && team !== Team.PLAYER) {
			return;
		}
		this._lps[team] = this._lps[team] + value;
	}

	get lps(): [number, number] {
		return this._lps;
	}

	get turn(): number {
		return this._turn;
	}

	get banListName(): string {
		return this._banListName;
	}

	get isFinished(): boolean {
		return this._finished;
	}

	finished(): void {
		this._finished = true;
	}
}
