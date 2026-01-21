import { EdoproBanList } from "../../../../../src/edopro/ban-list/domain/BanList";
import BanListMemoryRepository from "../../../../../src/edopro/ban-list/infrastructure/BanListMemoryRepository";
import { Card } from "../../../../../src/edopro/card/domain/Card";
import { CardRepository } from "../../../../../src/edopro/card/domain/CardRepository";
import { CardTypes } from "../../../../../src/edopro/card/domain/CardTypes";
import { DeckCreator } from "../../../../../src/edopro/deck/application/DeckCreator";
import { DeckRules, Rule } from "../../../../../src/edopro/room/domain/Room";

// Mock dependencies
const mockCardRepository: jest.Mocked<CardRepository> = {
  findByCode: jest.fn(),
};

jest.mock(
  "../../../../../src/edopro/ban-list/infrastructure/BanListMemoryRepository",
);

describe("DeckCreator", () => {
  let deckCreator: DeckCreator;
  const duelFlags = 0n;
  const deckRules = new DeckRules({
    mainMin: 40,
    mainMax: 60,
    extraMin: 0,
    extraMax: 15,
    sideMin: 0,
    sideMax: 15,
    rule: Rule.OCG_TCG,
    maxDeckPoints: 100,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    deckCreator = new DeckCreator(mockCardRepository, deckRules, duelFlags);
  });

  const createCard = (code: string, type: number): Card => {
    return new Card({
      code,
      type,
      alias: "0",
      category: 0,
      variant: 0,
    });
  };

  it("should build a deck correctly with main and side cards", async () => {
    const mainCodes = [123, 456];
    const sideCodes = [789];
    const banListHash = 111;

    const card1 = createCard("123", CardTypes.TYPE_MONSTER);
    const card2 = createCard("456", CardTypes.TYPE_SPELL);
    const card3 = createCard("789", CardTypes.TYPE_TRAP);

    mockCardRepository.findByCode.mockResolvedValueOnce(card1);
    mockCardRepository.findByCode.mockResolvedValueOnce(card2);
    mockCardRepository.findByCode.mockResolvedValueOnce(card3);

    const mockBanList = new EdoproBanList();
    (BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(
      mockBanList,
    );

    const deck = await deckCreator.build({
      main: mainCodes,
      side: sideCodes,
      banListHash,
    });

    expect(deck.main).toHaveLength(2);
    expect(deck.main).toContain(card1);
    expect(deck.main).toContain(card2);
    expect(deck.side).toHaveLength(1);
    expect(deck.side).toContain(card3);
    expect(deck.extra).toHaveLength(0);
    expect(BanListMemoryRepository.findByHash).toHaveBeenCalledWith(
      banListHash,
    );
  });

  it("should separate extra deck cards from main deck", async () => {
    const mainCodes = [100, 200];
    const sideCodes = [];
    const banListHash = 111;

    const fusionCard = createCard(
      "100",
      CardTypes.TYPE_MONSTER | CardTypes.TYPE_FUSION,
    );
    const normalCard = createCard("200", CardTypes.TYPE_MONSTER);

    mockCardRepository.findByCode.mockResolvedValueOnce(fusionCard);
    mockCardRepository.findByCode.mockResolvedValueOnce(normalCard);

    const deck = await deckCreator.build({
      main: mainCodes,
      side: sideCodes,
      banListHash,
    });

    expect(deck.main).toHaveLength(1);
    expect(deck.main).toContain(normalCard);
    expect(deck.extra).toHaveLength(1);
    expect(deck.extra).toContain(fusionCard);
  });

  it("should handle Ritual cards in extra deck when flag is enabled", async () => {
    const ritualFlag = 0x800000000n;
    deckCreator = new DeckCreator(mockCardRepository, deckRules, ritualFlag);

    const mainCodes = [300];
    const sideCodes = [];
    const banListHash = 111;

    const ritualCard = createCard(
      "300",
      CardTypes.TYPE_MONSTER | CardTypes.TYPE_RITUAL,
    );

    mockCardRepository.findByCode.mockResolvedValueOnce(ritualCard);

    const deck = await deckCreator.build({
      main: mainCodes,
      side: sideCodes,
      banListHash,
    });

    expect(deck.main).toHaveLength(0);
    expect(deck.extra).toHaveLength(1);
    expect(deck.extra).toContain(ritualCard);
  });

  it("should keep Ritual cards in main deck when flag is disabled", async () => {
    const mainCodes = [300];
    const sideCodes = [];
    const banListHash = 111;

    const ritualCard = createCard(
      "300",
      CardTypes.TYPE_MONSTER | CardTypes.TYPE_RITUAL,
    );

    mockCardRepository.findByCode.mockResolvedValueOnce(ritualCard);

    const deck = await deckCreator.build({
      main: mainCodes,
      side: sideCodes,
      banListHash,
    });

    expect(deck.main).toHaveLength(1);
    expect(deck.main).toContain(ritualCard);
    expect(deck.extra).toHaveLength(0);
  });

  it("should ignore missing cards", async () => {
    const mainCodes = [999];
    const sideCodes = [888];
    const banListHash = 111;

    mockCardRepository.findByCode.mockResolvedValue(null);

    const deck = await deckCreator.build({
      main: mainCodes,
      side: sideCodes,
      banListHash,
    });

    expect(deck.main).toHaveLength(0);
    expect(deck.side).toHaveLength(0);
  });

  it("should use default BanList if hash is not found", async () => {
    const mainCodes: number[] = [];
    const sideCodes: number[] = [];
    const banListHash = 999;

    (BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(null);

    const deck = await deckCreator.build({
      main: mainCodes,
      side: sideCodes,
      banListHash,
    });

    expect(deck).toBeDefined();
    expect(BanListMemoryRepository.findByHash).toHaveBeenCalledWith(
      banListHash,
    );
  });
});
