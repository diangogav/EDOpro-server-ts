import { MatchHistory, Player } from "src/shared/room/domain/match/domain/Match";
import { Rank } from "src/shared/value-objects/Rank";

export type PlayerData = Player & MatchHistory & { winner: boolean; ranks: Rank[]; score: number };
