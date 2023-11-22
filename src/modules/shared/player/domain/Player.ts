import { Team } from "../../../room/domain/Team";
import { Rank } from "../../value-objects/Rank";
import { PlayerData } from "./PlayerData";

export class Player {
	public readonly name: string;
	public readonly team: Team;
	public readonly winner: boolean;
	public readonly ranks: Rank[];

	constructor({ ranks, name, team, winner }: PlayerData) {
		this.ranks = ranks;
		this.name = name;
		this.team = team;
		this.winner = winner;
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
}
