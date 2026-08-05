import YGOProDeck from "ygopro-deck-encode";

import { shuffleDecksBySeed } from "./shuffle-decks-by-seed";

const SEED = [1, 2, 3, 4, 5, 6, 7, 8];

// Both seeds fold to the same 32-bit state (0x31e48131) under a
// 32-bit reduction of the 256-bit seed. A shuffle that consumes the
// full seed entropy must produce different orders for them.
const COLLIDING_SEED_A = [1, 2, 3, 4, 5, 6, 7, 8];
const COLLIDING_SEED_B = [101, 102, 103, 104, 105, 106, 107, 3091460252];

const createDeck = () =>
	new YGOProDeck({
		main: Array.from({ length: 40 }, (_, i) => 10000 + i),
		extra: Array.from({ length: 15 }, (_, i) => 20000 + i),
		side: Array.from({ length: 15 }, (_, i) => 30000 + i),
		name: "test-deck",
	});

describe("shuffleDecksBySeed", () => {
	it("produces the same order for the same seed", () => {
		const [first] = shuffleDecksBySeed([createDeck()], [...SEED]);
		const [second] = shuffleDecksBySeed([createDeck()], [...SEED]);

		expect(first!.main).toEqual(second!.main);
	});

	it("does not mutate the input decks", () => {
		const deck = createDeck();
		const originalMain = [...deck.main];

		shuffleDecksBySeed([deck], [...SEED]);

		expect(deck.main).toEqual(originalMain);
	});

	it("returns a permutation of the original main deck", () => {
		const deck = createDeck();

		const [shuffled] = shuffleDecksBySeed([deck], [...SEED]);

		expect([...shuffled!.main].sort()).toEqual([...deck.main].sort());
	});

	it("keeps extra and side deck order untouched", () => {
		const deck = createDeck();

		const [shuffled] = shuffleDecksBySeed([deck], [...SEED]);

		expect(shuffled!.extra).toEqual(deck.extra);
		expect(shuffled!.side).toEqual(deck.side);
	});

	it("produces different orders for different seeds", () => {
		const [first] = shuffleDecksBySeed([createDeck()], [1, 2, 3, 4, 5, 6, 7, 8]);
		const [second] = shuffleDecksBySeed([createDeck()], [8, 7, 6, 5, 4, 3, 2, 1]);

		expect(first!.main).not.toEqual(second!.main);
	});

	it("consumes the full seed entropy, not a 32-bit reduction", () => {
		const [first] = shuffleDecksBySeed([createDeck()], COLLIDING_SEED_A);
		const [second] = shuffleDecksBySeed([createDeck()], COLLIDING_SEED_B);

		expect(first!.main).not.toEqual(second!.main);
	});

	it("shuffles each deck with a single advancing rng stream", () => {
		const [first, second] = shuffleDecksBySeed([createDeck(), createDeck()], [...SEED]);
		const [alone] = shuffleDecksBySeed([createDeck()], [...SEED]);

		expect(first!.main).toEqual(alone!.main);
		expect(second!.main).not.toEqual(first!.main);
	});
});
