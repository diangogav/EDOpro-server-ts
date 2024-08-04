import { GameOverData } from "@modules/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";

export type MatchSummary = GameOverData & {
	banlistName: string;
};
