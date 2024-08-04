import { GameOverData } from "../../../../../room/domain/domain-events/GameOverDomainEvent";

export type MatchSummary = GameOverData & {
	banlistName: string;
};
