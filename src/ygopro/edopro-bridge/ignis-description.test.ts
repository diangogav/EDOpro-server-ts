import { ignisDescriptionToYgopro } from "./ignis-description";

const BLUE_EYES = 89631139;

describe("ignisDescriptionToYgopro", () => {
	it("keeps system strings unchanged", () => {
		expect(ignisDescriptionToYgopro(1160)).toBe(1160);
	});

	it("repacks a card description from code<<20|index to code*16+index", () => {
		expect(ignisDescriptionToYgopro(BLUE_EYES * 0x10_0000 + 3)).toBe(BLUE_EYES * 16 + 3);
	});

	it("rejects an index a card row cannot hold", () => {
		expect(ignisDescriptionToYgopro(BLUE_EYES * 0x10_0000 + 16)).toBeNull();
	});
});
