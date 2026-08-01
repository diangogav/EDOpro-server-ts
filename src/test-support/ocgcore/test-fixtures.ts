/**
 * Shared test fixtures for ocgcore integration tests.
 *
 * Exports:
 *   VANILLA_POOL  — 22 Lv4 vanilla normal monsters verified in classic.cdb, used to pad decks.
 *   FIXED_SEED    — 8-element uint32 seed for PseudoShuffle; keeps deck order deterministic.
 *   buildDeck     — build a 40-card (or custom-size) deck with specific cards at the top.
 */

/**
 * Pool of vanilla normal monsters verified present in
 * resources/current/ygopro/classic/classic.cdb. Used to pad decks to 40 cards.
 */
export const VANILLA_POOL: number[] = [
	549481, 732302, 1184620, 1784619, 2118022, 2311603, 2483611, 2863439, 3134241, 3170832, 4042268,
	5053103, 5265750, 5388481, 5434080, 5464695, 5628232, 5818798, 7359741, 7459013, 8471389,
	10071456,
];

/**
 * Deterministic seed for HeadlessDuel.create() — keeps PseudoShuffle ordering
 * identical across runs. 8 × uint32 as required by createDuelV2.
 */
export const FIXED_SEED: number[] = [0xdeadbeef, 0xcafebabe, 0x12345678, 0xabcdef01, 0, 0, 0, 0];

/**
 * Build a deck of `totalSize` cards (default 40) where `specificCards` occupy
 * positions [0..n-1] (top of deck = first drawn) and the remainder is filled
 * by cycling through VANILLA_POOL.
 *
 * deck.main[0] = first drawn (opening hand card #1) because the harness
 * reverses the array before loading cards via newCard().
 */
export function buildDeck(specificCards: number[], totalSize = 40): number[] {
	const deck: number[] = [...specificCards];
	let poolIdx = 0;
	while (deck.length < totalSize) {
		deck.push(VANILLA_POOL[poolIdx % VANILLA_POOL.length]);
		poolIdx++;
	}
	return deck;
}
