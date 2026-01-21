import { UpdateDeckMessageParser } from "../../../../../src/edopro/deck/application/UpdateDeckMessageSizeCalculator";

describe("UpdateDeckMessageParser", () => {
  it("should parse deck correctly", () => {
    const mainAndExtraCount = 2;
    const sideCount = 1;
    const card1 = 123;
    const card2 = 456;
    const card3 = 789;

    const buffer = Buffer.alloc(8 + (mainAndExtraCount + sideCount) * 4);
    buffer.writeUInt32LE(mainAndExtraCount, 0);
    buffer.writeUInt32LE(sideCount, 4);
    buffer.writeUInt32LE(card1, 8);
    buffer.writeUInt32LE(card2, 12);
    buffer.writeUInt32LE(card3, 16);

    const parser = new UpdateDeckMessageParser(buffer);
    const [mainDeck, sideDeck] = parser.getDeck();

    expect(mainDeck).toHaveLength(2);
    expect(mainDeck).toEqual([card1, card2]);
    expect(sideDeck).toHaveLength(1);
    expect(sideDeck).toEqual([card3]);
  });

  it("should handle empty decks", () => {
    const mainAndExtraCount = 0;
    const sideCount = 0;

    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(mainAndExtraCount, 0);
    buffer.writeUInt32LE(sideCount, 4);

    const parser = new UpdateDeckMessageParser(buffer);
    const [mainDeck, sideDeck] = parser.getDeck();

    expect(mainDeck).toHaveLength(0);
    expect(sideDeck).toHaveLength(0);
  });
});
