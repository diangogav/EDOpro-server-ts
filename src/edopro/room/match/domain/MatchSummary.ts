import { GameOverData } from "src/shared/room/domain/match/domain/domain-events/GameOverDomainEvent";

export type MatchSummary = GameOverData & {
	banlistName: string;
};
