import { MatchHistory, Player } from "../../match/domain/Match";

export type GameOverData = {
	bestOf: number;
	// needWins: number;
	turn: number;
	date: Date;
	players: (Player & MatchHistory & { winner: boolean })[];
	ranked: boolean;
};

export class GameOverDomainEvent {
	static readonly DOMAIN_EVENT = "GAME_OVER";
	readonly data: GameOverData;

	constructor(data: GameOverData) {
		this.data = data;
	}
}
