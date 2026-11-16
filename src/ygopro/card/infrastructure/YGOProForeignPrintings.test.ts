import { YGOProResourceLoader } from "@ygopro/ygopro/YGOProResourceLoader";

import { YGOProForeignPrintings } from "./YGOProForeignPrintings";

const NECROVALLEY = 47355498;
const NECROVALLEY_OWN_COPY = 910003011;
const DARK_MAGICIAN = 46986414;
const DARK_MAGICIAN_ALTERNATE_ART = 46986415;

/** Cards as the pool reader returns them: the original is an alias or a rule code. */
const POOL: Record<number, { alias: number; ruleCode: number }> = {
	[NECROVALLEY]: { alias: 0, ruleCode: 0 },
	[NECROVALLEY_OWN_COPY]: { alias: 0, ruleCode: NECROVALLEY },
	[DARK_MAGICIAN_ALTERNATE_ART]: { alias: DARK_MAGICIAN, ruleCode: 0 },
};

describe("YGOProForeignPrintings", () => {
	beforeEach(() => {
		jest.spyOn(YGOProResourceLoader, "get").mockReturnValue({
			getPoolCardReader: () => Promise.resolve((code: number) => POOL[code]),
		} as unknown as YGOProResourceLoader);
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("gives the original of an alternate artwork", async () => {
		expect(await new YGOProForeignPrintings().originalOf(DARK_MAGICIAN_ALTERNATE_ART)).toBe(
			DARK_MAGICIAN,
		);
	});

	it("gives the original of a copy that is far from it, which the reader files as a rule code", async () => {
		expect(await new YGOProForeignPrintings().originalOf(NECROVALLEY_OWN_COPY)).toBe(NECROVALLEY);
	});

	it("gives nothing for a card that is its own original", async () => {
		expect(await new YGOProForeignPrintings().originalOf(NECROVALLEY)).toBeNull();
	});

	it("gives nothing for a card the pool does not have", async () => {
		expect(await new YGOProForeignPrintings().originalOf(123)).toBeNull();
	});
});
