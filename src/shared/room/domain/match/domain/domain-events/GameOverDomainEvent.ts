import { PlayerMatchSummary } from "src/shared/player/domain/Player";

export type GameOverData = {
	bestOf: number;
	date: Date;
	players: PlayerMatchSummary[];
	banListHash: number;
};

export class GameOverDomainEvent {
	static readonly DOMAIN_EVENT = "GAME_OVER";
	readonly data: GameOverData;

	constructor(data: GameOverData) {
		this.data = data;
	}
}
