import { CardReader } from 'koishipro-core.js';
import { CardDataEntry } from 'ygopro-cdb-encode';

export const readCardWithReader = (
  reader: CardReader,
  cardId: number,
): Partial<CardDataEntry> | null | undefined =>
  typeof reader === 'function' ? reader(cardId) : reader.apply(cardId);
