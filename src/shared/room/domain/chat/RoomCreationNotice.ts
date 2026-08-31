import { ChatColor } from "ygopro-msg-encode";

import { createSystemChat } from "./SystemChat";

/**
 * The room-creation notice both pipelines show their host: a single colored
 * line stating whether the room counts toward rating. Ranking-disabled is
 * checked before the ranked flag — on edopro a room can never be flagged
 * ranked while ranking is globally off (Room.isRanked already forces it
 * false), so this order is a no-op there, but on the ygopro/Mercury
 * pipeline the league never consults the ranking toggle at all, so without
 * this order a verified/external room would show a false GREEN instead of
 * the disabled-ranking warning.
 */
export function roomCreationNotice({
	ranked,
	rankingEnabled,
}: {
	ranked: boolean;
	rankingEnabled: boolean;
}): Buffer {
	if (!rankingEnabled) {
		return createSystemChat(
			ChatColor.YELLOW,
			"Ranking is temporarily unavailable — this match won't be rated.",
		);
	}

	if (ranked) {
		return createSystemChat(ChatColor.GREEN, "Ranked room — results count toward your rating.");
	}

	return createSystemChat(ChatColor.WHITE, "Casual room — results won't affect your rating.");
}
