import { ChatColor, YGOProStocChat } from "ygopro-msg-encode";

import { createSystemChat } from "./SystemChat";

describe("createSystemChat", () => {
	it("builds a STOC_CHAT (0x19) frame carrying the given color and text", () => {
		const frame = createSystemChat(ChatColor.YELLOW, "Side deck: 3 minutes to submit.");

		const expectedFrame = Buffer.from(
			new YGOProStocChat()
				.fromPartial({ player_type: ChatColor.YELLOW, msg: "Side deck: 3 minutes to submit." })
				.toFullPayload(),
		);

		expect(frame).toEqual(expectedFrame);
	});

	it("returns a Buffer ready for socket.send", () => {
		const frame = createSystemChat(ChatColor.RED, "Wrong password.");

		expect(Buffer.isBuffer(frame)).toBe(true);
	});

	// STOC_CHAT silently truncates to MAX_LENGTH UTF-16 units — pin that a
	// too-long system message round-trips truncated instead of throwing or
	// corrupting the frame, mirroring RatingAnnouncement.lengthPin.test.ts.
	it("silently truncates text over YGOProStocChat.MAX_LENGTH on the wire round trip", () => {
		const longText = "x".repeat(300);
		const frame = createSystemChat(ChatColor.WHITE, longText);

		const decoded = new YGOProStocChat().fromPayload(frame.subarray(3));

		expect(decoded.msg.length).toBe(YGOProStocChat.MAX_LENGTH);
		expect(decoded.msg.length).toBeLessThan(longText.length);
		expect(decoded.msg).toBe(longText.slice(0, YGOProStocChat.MAX_LENGTH));
	});
});
