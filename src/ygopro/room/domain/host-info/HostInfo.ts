import { GameMode, HostInfo as YGOCoreHostInfo } from "ygopro-msg-encode";

import { YGOProRule } from "./YGOProRule";

export interface HostInfo extends YGOCoreHostInfo {
	rule: YGOProRule;
	best_of: number;
	max_deck_points: number;
}
