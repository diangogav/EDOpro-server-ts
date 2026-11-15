import {
	IndexResponse,
	YGOProMsgAnnounceRace,
	YGOProMsgSelectCard,
	YGOProMsgSelectPosition,
	YGOProMsgSelectSum,
	YGOProMsgSelectTribute,
	YGOProMsgSelectUnselectCard,
} from "ygopro-msg-encode";
import { translateResponseToIgnis } from "./translateResponseToIgnis";

describe("translateResponseToIgnis", () => {
	const cancel = Uint8Array.from([0xff, 0xff, 0xff, 0xff]);

	it("rewrites a card selection as an Ignis index list", () => {
		const prompt = new YGOProMsgSelectCard();

		expect(Array.from(translateResponseToIgnis(prompt, Uint8Array.from([2, 0, 2])))).toEqual([
			2, 0, 0, 0, 2, 0, 0, 0, 0, 2,
		]);
	});

	it("keeps a cancel as it is", () => {
		expect(translateResponseToIgnis(new YGOProMsgSelectCard(), cancel)).toBe(cancel);
		expect(translateResponseToIgnis(new YGOProMsgSelectUnselectCard(), cancel)).toBe(cancel);
	});

	it("sends only the chosen cards of a sum, without the forced ones", () => {
		const prompt = new YGOProMsgSelectSum();
		prompt.mustSelectCount = 1;

		expect(Array.from(translateResponseToIgnis(prompt, Uint8Array.from([3, 0, 4, 1])))).toEqual([
			2, 0, 0, 0, 2, 0, 0, 0, 4, 1,
		]);
	});

	it("widens the one-card toggle and the race mask", () => {
		expect(
			Array.from(
				translateResponseToIgnis(new YGOProMsgSelectUnselectCard(), Uint8Array.from([1, 3])),
			),
		).toEqual([1, 0, 0, 0, 3, 0, 0, 0]);
		expect(
			Array.from(
				translateResponseToIgnis(new YGOProMsgAnnounceRace(), Uint8Array.from([0, 128, 0, 0])),
			),
		).toEqual([0, 128, 0, 0, 0, 0, 0, 0]);
	});

	it("leaves the answers both cores read the same way", () => {
		const position = new YGOProMsgSelectPosition().prepareResponse(0x1);

		expect(translateResponseToIgnis(new YGOProMsgSelectPosition(), position)).toBe(position);
		expect(
			translateResponseToIgnis(new YGOProMsgSelectTribute(), Uint8Array.from([1, 0])),
		).toHaveLength(9);
		expect(IndexResponse(0)).toBeDefined();
	});
});
