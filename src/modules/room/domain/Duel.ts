import { BanList } from "../../ban-list/domain/BanList";
import { Team } from "./Team";

export class Duel {
	private _turn: number;
	private readonly _lps: [number, number];
	private readonly _banlist: BanList | null;
	private _surrendered: boolean;

	constructor(turn: number, lps: [number, number], banlist: BanList | null) {
		this._turn = turn;
		this._lps = lps;
		this._banlist = banlist;
		this._surrendered = false;
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

	get banlistName(): string | null {
		return this._banlist?.name ?? "N/A";
	}

	get isSurrendered(): boolean {
		return this._surrendered;
	}

	surrendered(): void {
		this._surrendered = true;
	}
}
