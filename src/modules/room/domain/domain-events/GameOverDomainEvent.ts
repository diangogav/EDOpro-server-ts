import { MatchHistory, Player } from "../../match/domain/Match";

export type PlayerData = Player & MatchHistory & { winner: boolean };

export type GameOverData = {
	bestOf: number;
	// needWins: number;
	turn: number;
	date: Date;
	players: PlayerData[];
	ranked: boolean;
	banlistHash: number;
};

export class GameOverDomainEvent {
	static readonly DOMAIN_EVENT = "GAME_OVER";
	readonly data: GameOverData;

	constructor(data: GameOverData) {
		this.data = data;
	}
}
