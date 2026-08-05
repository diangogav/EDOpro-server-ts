import YGOProDeck from "ygopro-deck-encode";

const UINT32_RANGE = 0x1_0000_0000;
const MASK64 = (1n << 64n) - 1n;

const splitMix64 = (value: bigint): bigint => {
	let z = (value + 0x9e37_79b9_7f4a_7c15n) & MASK64;
	z = ((z ^ (z >> 30n)) * 0xbf58_476d_1ce4_e5b9n) & MASK64;
	z = ((z ^ (z >> 27n)) * 0x94d0_49bb_1331_11ebn) & MASK64;
	return z ^ (z >> 31n);
};

const rotl64 = (x: bigint, k: bigint): bigint => ((x << k) & MASK64) | (x >> (64n - k));

// xoshiro256** seeded through SplitMix64 so the full 256-bit seed
// sequence drives the shuffle instead of a 32-bit reduction.
const createSeededRng = (seed: number[]) => {
	// Seed layout: 8 uint32 words folded pairwise into 4 uint64 lanes;
	// missing words default to zero. SplitMix64 is bijective per lane, so
	// no seed entropy is lost.
	const lane = (index: number) => {
		const low = BigInt((seed[index * 2] ?? 0) >>> 0);
		const high = BigInt((seed[index * 2 + 1] ?? 0) >>> 0);
		return splitMix64((high << 32n) | low);
	};
	let s0 = lane(0);
	let s1 = lane(1);
	let s2 = lane(2);
	let s3 = lane(3);
	// An all-zero state is a fixed point of xoshiro256** (constant output);
	// fall back to the SplitMix64 golden-ratio constant so it always advances.
	if (s0 === 0n && s1 === 0n && s2 === 0n && s3 === 0n) {
		s0 = 0x9e37_79b9_7f4a_7c15n;
	}
	return () => {
		const result = (rotl64((s1 * 5n) & MASK64, 7n) * 9n) & MASK64;
		const t = (s1 << 17n) & MASK64;
		s2 ^= s0;
		s3 ^= s1;
		s1 ^= s2;
		s0 ^= s3;
		s2 ^= t;
		s3 = rotl64(s3, 45n);
		return Number(result >> 32n);
	};
};

const nextInt = (nextU32: () => number, maxExclusive: number) => {
	if (maxExclusive <= 1) {
		return 0;
	}
	const bound = UINT32_RANGE - (UINT32_RANGE % maxExclusive);
	let value = nextU32();
	while (value >= bound) {
		value = nextU32();
	}
	return value % maxExclusive;
};

const shuffleMainDeck = (main: number[], nextU32: () => number) => {
	for (let i = main.length - 1; i > 0; --i) {
		const j = nextInt(nextU32, i + 1);
		[main[i], main[j]] = [main[j], main[i]];
	}
};

export const shuffleDecksBySeed = (decks: YGOProDeck[], seed: number[]) => {
	const nextU32 = createSeededRng(seed);
	return decks.map((deck) => {
		const cloned = new YGOProDeck(deck);
		shuffleMainDeck(cloned.main, nextU32);
		return cloned;
	});
};
