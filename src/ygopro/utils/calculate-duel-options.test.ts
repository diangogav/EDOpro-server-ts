import { OcgcoreDuelOptionFlag } from "koishipro-core.js";
import { GameMode } from "ygopro-msg-encode";

import { HostInfo } from "@ygopro/room/domain/host-info/HostInfo";
import { calculateDuelOptions, DUEL_TCG_SEGOC_NONPUBLIC } from "./calculate-duel-options";

function makeHostInfo(overrides?: Partial<HostInfo>): HostInfo {
	return {
		lflist: 0,
		rule: 1,
		mode: GameMode.SINGLE,
		duel_rule: 5,
		no_check_deck: 0,
		no_shuffle_deck: 0,
		start_lp: 8000,
		start_hand: 5,
		draw_count: 1,
		time_limit: 450,
		max_deck_points: 100,
		best_of: 1,
		tcg_segoc_nonpublic: 0,
		...overrides,
	};
}

describe("calculateDuelOptions", () => {
	it("packs the duel rule into the high 16 bits", () => {
		expect(calculateDuelOptions(makeHostInfo({ duel_rule: 5 }))).toBe(5 << 16);
	});

	it("leaves the TCG SEGOC option off by default", () => {
		expect(calculateDuelOptions(makeHostInfo()) & DUEL_TCG_SEGOC_NONPUBLIC).toBe(0);
	});

	it("sets the TCG SEGOC option when the room enables it", () => {
		const opt = calculateDuelOptions(makeHostInfo({ tcg_segoc_nonpublic: 1 }));

		expect(opt & DUEL_TCG_SEGOC_NONPUBLIC).toBe(DUEL_TCG_SEGOC_NONPUBLIC);
		expect(opt >> 16).toBe(5);
	});

	it("keeps the shuffle and tag options alongside the TCG SEGOC option", () => {
		const opt = calculateDuelOptions(
			makeHostInfo({ tcg_segoc_nonpublic: 1, no_shuffle_deck: 1, mode: GameMode.TAG }),
		);

		expect(opt & OcgcoreDuelOptionFlag.PseudoShuffle).toBe(OcgcoreDuelOptionFlag.PseudoShuffle);
		expect(opt & OcgcoreDuelOptionFlag.TagMode).toBe(OcgcoreDuelOptionFlag.TagMode);
		expect(opt & DUEL_TCG_SEGOC_NONPUBLIC).toBe(DUEL_TCG_SEGOC_NONPUBLIC);
	});
});
