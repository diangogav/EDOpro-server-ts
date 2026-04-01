import { CardReader } from 'koishipro-core.js';
import YGOProDeck from 'ygopro-deck-encode';
import { HostInfo, OcgcoreCommonConstants } from 'ygopro-msg-encode';
import { readCardWithReader } from './read-card-with-reader';

declare module 'ygopro-msg-encode' {
  interface HostInfo {
    sideins?: number;
  }
}

const { TYPES_EXTRA_DECK } = OcgcoreCommonConstants;

export const calculateOcgcoreDeck = (
  deck: YGOProDeck,
  hostinfo: HostInfo,
  cardReader: CardReader,
): YGOProDeck => {
  if (!hostinfo.sideins || deck.side.length === 0) {
    return deck;
  }

  const sideExtra = deck.side.filter((card) => {
    const cardEntry = readCardWithReader(cardReader, card);
    return !!(cardEntry?.type && cardEntry.type & TYPES_EXTRA_DECK);
  });

  if (sideExtra.length === 0) {
    return deck;
  }

  return new YGOProDeck({
    main: [...deck.main],
    extra: [...deck.extra, ...sideExtra],
    side: [...deck.side],
    name: deck.name,
  });
};
