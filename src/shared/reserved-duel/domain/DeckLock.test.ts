import { deckHonoursLock } from "./DeckLock";

const required = { main: [1, 1, 2], extra: [10], side: [20, 21] };

describe("deckHonoursLock", () => {
	describe("exact", () => {
		it("accepts the same cards per section in any order", () => {
			expect(
				deckHonoursLock("exact", required, { main: [2, 1, 1], extra: [10], side: [21, 20] }),
			).toBe(true);
		});

		it("rejects a card swapped between main and side", () => {
			expect(
				deckHonoursLock("exact", required, { main: [1, 20, 2], extra: [10], side: [1, 21] }),
			).toBe(false);
		});

		it("rejects a different copy count", () => {
			expect(
				deckHonoursLock("exact", required, { main: [1, 2, 2], extra: [10], side: [20, 21] }),
			).toBe(false);
		});
	});

	describe("registered", () => {
		it("accepts cards moved between main and side", () => {
			expect(
				deckHonoursLock("registered", required, { main: [1, 20, 2], extra: [10], side: [1, 21] }),
			).toBe(true);
		});

		it("rejects a card that was never registered", () => {
			expect(
				deckHonoursLock("registered", required, { main: [1, 1, 2], extra: [10], side: [20, 99] }),
			).toBe(false);
		});
	});
});
