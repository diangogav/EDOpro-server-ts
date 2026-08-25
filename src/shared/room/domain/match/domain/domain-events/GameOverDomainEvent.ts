import { PlayerMatchSummary } from "src/shared/player/domain/Player";

export type GameOverData = {
	/** Room the match was played in. 4-digit id: unique enough to correlate logs, not to key storage. */
	roomId: number;
	/** Stable uuid of the match, assigned when the match is created. */
	matchId: string;
	/** duelIds of every game of the match, in the order they were played. */
	duelIds: string[];
	bestOf: number;
	date: Date;
	players: PlayerMatchSummary[];
	banListHash: number;
	banListName: string;
	ranked: boolean;
};

export class GameOverDomainEvent {
	static readonly DOMAIN_EVENT = "GAME_OVER";
	readonly data: GameOverData;

	constructor(data: GameOverData) {
		this.data = data;
	}
}
