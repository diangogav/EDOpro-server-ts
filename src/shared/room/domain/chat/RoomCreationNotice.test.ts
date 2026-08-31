import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { roomCreationNotice } from "./RoomCreationNotice";

const expectedFrame = (color: ChatColor, text: string): Buffer =>
	Buffer.from(new YGOProStocChat().fromPartial({ player_type: color, msg: text }).toFullPayload());

describe("roomCreationNotice", () => {
	it("returns a GREEN notice for a ranked room while ranking is enabled", () => {
		const frame = roomCreationNotice({ ranked: true, rankingEnabled: true });

		expect(frame).toEqual(
			expectedFrame(ChatColor.GREEN, "Ranked room — results count toward your rating."),
		);
	});

	it("returns a WHITE notice for a casual room while ranking is enabled", () => {
		const frame = roomCreationNotice({ ranked: false, rankingEnabled: true });

		expect(frame).toEqual(
			expectedFrame(ChatColor.WHITE, "Casual room — results won't affect your rating."),
		);
	});

	// Ranking-disabled takes priority over the ranked flag: a room that was
	// flagged ranked before the global toggle flipped off must still fall
	// back to the disabled notice, not a stale GREEN one.
	it("returns a YELLOW notice when ranking is globally disabled, even for a ranked room", () => {
		const frame = roomCreationNotice({ ranked: true, rankingEnabled: false });

		expect(frame).toEqual(
			expectedFrame(
				ChatColor.YELLOW,
				"Ranking is temporarily unavailable — this match won't be rated.",
			),
		);
	});

	it("returns a YELLOW notice for a casual room when ranking is globally disabled", () => {
		const frame = roomCreationNotice({ ranked: false, rankingEnabled: false });

		expect(frame).toEqual(
			expectedFrame(
				ChatColor.YELLOW,
				"Ranking is temporarily unavailable — this match won't be rated.",
			),
		);
	});
});
