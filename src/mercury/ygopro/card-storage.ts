import type { CardReaderFn } from 'koishipro-core.js';
import { CardDataEntry } from 'ygopro-cdb-encode';
import { TransportType } from 'yuzuthread';
import {
  CARD_DATA_WITH_OT_PAYLOAD_SIZE,
  CardDataWithOt,
} from './card-data-with-ot';

const CARD_ID_MIN = 1;
const CARD_ID_MAX = 0x7fffffff;
const HASH_LOAD_FACTOR = 0.75;
const HASH_MIN_CAPACITY = 16;
const CARD_ENTRY_SIZE = CARD_DATA_WITH_OT_PAYLOAD_SIZE;

const isValidCardId = (cardId: number) =>
  Number.isInteger(cardId) && cardId >= CARD_ID_MIN && cardId <= CARD_ID_MAX;

export class CardStorage {
  @TransportType(() => Buffer)
  private entries: Buffer;

  @TransportType(() => Buffer)
  private hashKeys: Buffer;

  @TransportType(() => Buffer)
  private hashValues: Buffer;

  @TransportType(() => Buffer)
  ocgcoreWasmBinary?: Buffer;

  private hashMask: number;
  size: number;

  constructor(
    entries: Buffer,
    hashKeys: Buffer,
    hashValues: Buffer,
    ocgcoreWasmBinary: Buffer | undefined,
    hashMask: number,
    size: number,
  ) {
    this.entries = entries;
    this.hashKeys = hashKeys;
    this.hashValues = hashValues;
    this.ocgcoreWasmBinary = ocgcoreWasmBinary;
    this.hashMask = hashMask;
    this.size = size;
  }

  static fromCards(
    cards: Iterable<CardDataEntry>,
    ocgcoreWasmBinary?: Buffer,
  ): CardStorage {
    const uniqueCards: CardDataEntry[] = [];
    const seen = new Set<number>();
    for (const card of cards) {
      const cardId = (card.code ?? 0) >>> 0;
      if (!isValidCardId(cardId) || seen.has(cardId)) {
        continue;
      }
      seen.add(cardId);
      uniqueCards.push(card);
    }

    const hashCapacity = this.computeHashCapacity(uniqueCards.length);
    const entries = Buffer.alloc(uniqueCards.length * CARD_ENTRY_SIZE);
    const hashKeys = Buffer.alloc(hashCapacity * 4);
    const hashValues = Buffer.alloc(hashCapacity * 4);

    const storage = new CardStorage(
      entries,
      hashKeys,
      hashValues,
      ocgcoreWasmBinary,
      hashCapacity - 1,
      uniqueCards.length,
    );

    for (let i = 0; i < uniqueCards.length; i++) {
      storage.writeEntry(i, uniqueCards[i]);
      storage.insertHash(uniqueCards[i].code >>> 0, i);
    }

    return storage;
  }

  get byteLength() {
    return this.entries.length + this.hashKeys.length + this.hashValues.length;
  }

  readCard(cardId: number): CardDataWithOt | undefined {
    if (!isValidCardId(cardId)) {
      return undefined;
    }

    const entryIndex = this.findEntryIndex(cardId >>> 0);
    if (entryIndex < 0) {
      return undefined;
    }

    return this.readEntry(entryIndex);
  }

  toCardReader(): CardReaderFn {
    return (cardId: number) => {
      const data = this.readCard(cardId);
      if (!data) {
        return undefined;
      }
      return {
        code: data.code,
        ot: data.ot,
        alias: data.alias,
        setcode: [...(data.setcode ?? [])],
        type: data.type,
        level: data.level,
        attribute: data.attribute,
        race: data.race,
        attack: data.attack,
        defense: data.defense,
        lscale: data.lscale,
        rscale: data.rscale,
        linkMarker: data.linkMarker,
        ruleCode: data.ruleCode,
      };
    };
  }

  private static computeHashCapacity(cardCount: number) {
    const required = Math.max(1, Math.ceil(cardCount / HASH_LOAD_FACTOR));
    let capacity = HASH_MIN_CAPACITY;
    while (capacity < required) {
      capacity <<= 1;
    }
    return capacity;
  }

  private hash(cardId: number) {
    return (Math.imul(cardId, 0x9e3779b1) >>> 0) & this.hashMask;
  }

  private getHashKeysView() {
    return new Uint32Array(
      this.hashKeys.buffer,
      this.hashKeys.byteOffset,
      this.hashKeys.length >>> 2,
    );
  }

  private getHashValuesView() {
    return new Uint32Array(
      this.hashValues.buffer,
      this.hashValues.byteOffset,
      this.hashValues.length >>> 2,
    );
  }

  private getEntryPayload(entryIndex: number) {
    const offset = entryIndex * CARD_ENTRY_SIZE;
    return this.entries.subarray(offset, offset + CARD_ENTRY_SIZE);
  }

  private writeEntry(entryIndex: number, card: CardDataEntry) {
    const payload =
      card instanceof CardDataWithOt
        ? card.toPayload()
        : new CardDataWithOt()
            .fromPartial({
              code: card.code,
              ot: card.ot,
              alias: card.alias,
              setcode: card.setcode,
              type: card.type,
              level: card.level,
              attribute: card.attribute,
              race: card.race,
              attack: card.attack,
              defense: card.defense,
              lscale: card.lscale,
              rscale: card.rscale,
              linkMarker: card.linkMarker,
              ruleCode: card.ruleCode,
              category: card.category,
            })
            .toPayload();
    if (payload.length !== CARD_ENTRY_SIZE) {
      throw new TypeError(
        `Unexpected card entry payload size: ${payload.length}`,
      );
    }
    this.entries.set(payload, entryIndex * CARD_ENTRY_SIZE);
  }

  private readEntry(entryIndex: number): CardDataWithOt {
    return new CardDataWithOt().fromPayload(this.getEntryPayload(entryIndex));
  }

  private insertHash(cardId: number, entryIndex: number) {
    const keys = this.getHashKeysView();
    const values = this.getHashValuesView();
    let slot = this.hash(cardId);

    while (true) {
      const key = keys[slot];
      if (key === 0) {
        keys[slot] = cardId;
        values[slot] = entryIndex + 1;
        return;
      }
      if (key === cardId) {
        return;
      }
      slot = (slot + 1) & this.hashMask;
    }
  }

  private findEntryIndex(cardId: number) {
    const keys = this.getHashKeysView();
    const values = this.getHashValuesView();
    let slot = this.hash(cardId);

    while (true) {
      const key = keys[slot];
      if (key === 0) {
        return -1;
      }
      if (key === cardId) {
        const value = values[slot];
        return value > 0 ? value - 1 : -1;
      }
      slot = (slot + 1) & this.hashMask;
    }
  }
}
