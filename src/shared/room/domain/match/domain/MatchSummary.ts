import { GameOverData } from "./domain-events/GameOverDomainEvent";

export type MatchSummary = GameOverData & {
	banListName: string;
};
