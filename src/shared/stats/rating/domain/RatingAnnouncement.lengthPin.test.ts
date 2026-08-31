import { YGOProStocChat } from "ygopro-msg-encode";

import fixtures from "./__fixtures__/ratingAnnouncement.fixture.json";
import { formatEnd } from "./RatingAnnouncement";

describe("RatingAnnouncement length pin", () => {
	it("keeps the worst-case 2v2 end frame within the STOC_CHAT wire limit", () => {
		const frame = formatEnd(fixtures.worstCaseEnd.parsed.teams);

		expect(frame).toBe(fixtures.worstCaseEnd.frame);
		expect(frame.length).toBeLessThanOrEqual(YGOProStocChat.MAX_LENGTH);
	});

	it("survives the real STOC_CHAT wire encode/decode round trip untruncated", () => {
		const frame = formatEnd(fixtures.worstCaseEnd.parsed.teams);

		const encoded = new YGOProStocChat().fromPartial({ player_type: 18, msg: frame }).toPayload();
		const decoded = new YGOProStocChat().fromPayload(encoded);

		expect(decoded.msg).toBe(frame);
		expect(decoded.msg.length).toBe(frame.length);
	});
});
