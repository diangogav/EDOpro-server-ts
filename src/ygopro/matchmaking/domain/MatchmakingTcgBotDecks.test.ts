import { MATCHMAKING_TCG_BOT_DECKS, pickRandomTcgBotDeck } from "./MatchmakingTcgBotDecks";

describe("MATCHMAKING_TCG_BOT_DECKS", () => {
	it("is a non-empty pool of deck names", () => {
		expect(Array.isArray(MATCHMAKING_TCG_BOT_DECKS)).toBe(true);
		expect(MATCHMAKING_TCG_BOT_DECKS.length).toBeGreaterThan(0);
	});

	it("contains only non-empty, unique deck strings", () => {
		const seen = new Set<string>();
		for (const deck of MATCHMAKING_TCG_BOT_DECKS) {
			expect(typeof deck).toBe("string");
			expect(deck.length).toBeGreaterThan(0);
			expect(seen.has(deck)).toBe(false);
			seen.add(deck);
		}
	});
});

describe("pickRandomTcgBotDeck", () => {
	it("always returns a member of the TCG pool", () => {
		for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
			const deck = pickRandomTcgBotDeck(() => r);
			expect(MATCHMAKING_TCG_BOT_DECKS).toContain(deck);
		}
	});

	it("selects by index using the injected random source", () => {
		expect(pickRandomTcgBotDeck(() => 0)).toBe(MATCHMAKING_TCG_BOT_DECKS[0]);
		expect(pickRandomTcgBotDeck(() => 0.999)).toBe(
			MATCHMAKING_TCG_BOT_DECKS[MATCHMAKING_TCG_BOT_DECKS.length - 1],
		);
	});

	it("clamps to the last deck when random() returns exactly 1.0", () => {
		// Math.floor(1.0 * len) === len → out-of-range/undefined without the clamp.
		const deck = pickRandomTcgBotDeck(() => 1);
		expect(deck).toBe(MATCHMAKING_TCG_BOT_DECKS[MATCHMAKING_TCG_BOT_DECKS.length - 1]);
		expect(MATCHMAKING_TCG_BOT_DECKS).toContain(deck);
	});
});
