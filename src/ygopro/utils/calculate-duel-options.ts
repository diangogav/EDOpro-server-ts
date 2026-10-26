import { OcgcoreDuelOptionFlag } from "koishipro-core.js";

import { HostInfo } from "@ygopro/room/domain/host-info/HostInfo";

/** Fork ocgcore option: non-public trigger effects join SEGOC (TCG ruling). */
export const DUEL_TCG_SEGOC_NONPUBLIC = 0x200;

/**
 * Calculate duel options from HostInfo
 * @param hostinfo Room HostInfo
 * @returns Duel options number
 */
export function calculateDuelOptions(hostinfo: HostInfo): number {
	// duel_rule is stored in high 16 bits
	let opt = hostinfo.duel_rule << 16;

	if (hostinfo.no_shuffle_deck) {
		opt |= OcgcoreDuelOptionFlag.PseudoShuffle;
	}

	if (hostinfo.mode & 0x2) {
		opt |= OcgcoreDuelOptionFlag.TagMode;
	}

	if (hostinfo.tcg_segoc_nonpublic) {
		opt |= DUEL_TCG_SEGOC_NONPUBLIC;
	}

	return opt;
}
