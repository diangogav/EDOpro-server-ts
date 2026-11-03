import { GameMode, HostInfo as YGOCoreHostInfo } from "ygopro-msg-encode";

import { YGOProRule } from "./YGOProRule";

export interface HostInfo extends YGOCoreHostInfo {
	rule: YGOProRule;
	best_of: number;
	max_deck_points: number;
	/** 1 = TCG SEGOC: non-public trigger effects join SEGOC instead of resolving after it (OCG). */
	tcg_segoc_nonpublic: number;
	/** 1 = Goat Format 2005 era rulings (fork core DUEL_GOAT_2005): ATK/DEF modifiers during damage calculation, response window after the hand-size discard. */
	goat_2005: number;
}
