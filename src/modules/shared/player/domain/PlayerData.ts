import { MatchHistory, Player } from "@modules/shared/room/domain/match/domain/Match";
import { Rank } from "@modules/shared/value-objects/Rank";

export type PlayerData = Player & MatchHistory & { winner: boolean; ranks: Rank[]; score: number };
