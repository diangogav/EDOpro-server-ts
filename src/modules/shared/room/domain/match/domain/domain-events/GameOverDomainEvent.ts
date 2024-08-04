import { PlayerMatchSummary } from "@modules/shared/player/domain/Player";

export type GameOverData = {
	bestOf: number;
	date: Date;
	players: PlayerMatchSummary[];
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
