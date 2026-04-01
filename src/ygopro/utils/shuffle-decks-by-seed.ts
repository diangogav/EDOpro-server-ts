import YGOProDeck from 'ygopro-deck-encode';

const UINT32_RANGE = 0x1_0000_0000;

const createSeededRng = (seed: number[]) => {
  let state = 0x9e37_79b9;
  for (const value of seed) {
    state = (Math.imul(state ^ (value >>> 0), 1664525) + 1013904223) >>> 0;
  }
  if (state === 0) {
    state = 1;
  }
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
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
