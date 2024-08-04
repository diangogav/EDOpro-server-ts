import { GameOverData } from "@modules/room/domain/domain-events/GameOverDomainEvent";

export type MatchSummary = GameOverData & {
	banlistName: string;
};
