import { Rank } from "../../shared/value-objects/Rank";

export class User {
	readonly username: string;
	readonly password: string;
	readonly ranks: Rank[];

	constructor({
		username,
		password,
		ranks,
	}: {
		username: string;
		password: string;
		ranks: { name: string; position: number; points: number }[];
	}) {
		this.username = username;
		this.password = password;
		this.ranks = ranks.map((item) => new Rank(item));
	}

	isValidPassword(password: string): boolean {
		return password === this.password;
	}
}
