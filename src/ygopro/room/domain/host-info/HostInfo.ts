import { GameMode, HostInfo as YGOCoreHostInfo } from "ygopro-msg-encode";

export interface HostInfo extends YGOCoreHostInfo {
	best_of: number;
	max_deck_points: number;
}
