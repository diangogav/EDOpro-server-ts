import { MatchHistory, Player } from "src/shared/room/domain/match/domain/Match";

export type PlayerData = Player & MatchHistory & { winner: boolean; score: number };
