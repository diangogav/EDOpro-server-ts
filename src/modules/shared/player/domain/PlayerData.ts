import { MatchHistory, Player } from "../../../room/match/domain/Match";
import { Rank } from "../../value-objects/Rank";

export type PlayerData = Player & MatchHistory & { winner: boolean; ranks: Rank[] };
