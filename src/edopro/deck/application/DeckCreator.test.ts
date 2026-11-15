import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { Card } from "@shared/card/domain/Card";
import { CardRepository } from "@shared/card/domain/CardRepository";
import { CardTypes } from "@shared/card/domain/CardTypes";
import { Rule } from "@shared/deck/domain/Rule";
import { DeckCreator } from "./DeckCreator";
import { useForeignPrintings } from "../domain/ForeignPrintings";
import { DeckRules } from "@shared/room/domain/YgoRoom";

// Mock dependencies
const mockCardRepository: jest.Mocked<CardRepository> = {
	findByCode: jest.fn(),
};

jest.mock("@edopro/ban-list/infrastructure/BanListMemoryRepository");

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
		(BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(mockBanList);

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
		expect(BanListMemoryRepository.findByHash).toHaveBeenCalledWith(banListHash);
	});

	it("should separate extra deck cards from main deck", async () => {
		const mainCodes = [100, 200];
		const sideCodes = [];
		const banListHash = 111;

		const fusionCard = createCard("100", CardTypes.TYPE_MONSTER | CardTypes.TYPE_FUSION);
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

		const ritualCard = createCard("300", CardTypes.TYPE_MONSTER | CardTypes.TYPE_RITUAL);

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

		const ritualCard = createCard("300", CardTypes.TYPE_MONSTER | CardTypes.TYPE_RITUAL);

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
		expect(BanListMemoryRepository.findByHash).toHaveBeenCalledWith(banListHash);
	});

	it("leaves an unknown code out without failing the deck by default", async () => {
		mockCardRepository.findByCode.mockResolvedValueOnce(null);
		(BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(new EdoproBanList());

		const deck = await deckCreator.build({ main: [910003001], side: [], banListHash: 111 });

		expect(deck.main).toHaveLength(0);
		expect(deck.validate()?.code).not.toBe(910003001);
	});

	it("fails the deck naming the unknown code when asked to reject unknown codes", async () => {
		mockCardRepository.findByCode.mockResolvedValueOnce(null);
		(BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(new EdoproBanList());

		const deck = await deckCreator.build({
			main: [910003001],
			side: [],
			banListHash: 111,
			fromForeignCardPool: true,
		});

		expect(deck.validate()).toMatchObject({ code: 910003001 });
	});

	describe("deck from another card pool on a whitelist", () => {
		const NECROVALLEY = 47355498;
		const NECROVALLEY_PRE_ERRATA = 511002998;

		const whitelistNaming = (...codes: number[]): EdoproBanList => {
			const banList = new EdoproBanList();
			codes.forEach((code) => banList.add(code, 3));
			banList.whileListed();

			return banList;
		};

		const buildWith = async (banList: EdoproBanList, printings: Card[]): Promise<string[]> => {
			const original = new Card({
				code: String(NECROVALLEY),
				type: CardTypes.TYPE_SPELL,
				alias: "0",
				category: 0,
				variant: 0,
			});
			mockCardRepository.findByCode.mockResolvedValueOnce(original);
			(BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(banList);
			const creator = new DeckCreator(mockCardRepository, deckRules, duelFlags, {
				findByAlias: jest.fn().mockResolvedValue(printings),
			});

			const deck = await creator.build({
				main: [NECROVALLEY],
				side: [],
				banListHash: 111,
				fromForeignCardPool: true,
			});

			return deck.main.map((card) => card.code);
		};

		const preErrata = new Card({
			code: String(NECROVALLEY_PRE_ERRATA),
			type: CardTypes.TYPE_SPELL,
			alias: String(NECROVALLEY),
			category: 0,
			variant: 0,
		});

		it("plays the printing the list names when it does not name the one sent", async () => {
			expect(await buildWith(whitelistNaming(NECROVALLEY_PRE_ERRATA), [preErrata])).toEqual([
				String(NECROVALLEY_PRE_ERRATA),
			]);
		});

		it("keeps the card sent when the list names it", async () => {
			expect(await buildWith(whitelistNaming(NECROVALLEY), [preErrata])).toEqual([
				String(NECROVALLEY),
			]);
		});

		it("keeps the card sent when no printing is on the list", async () => {
			expect(await buildWith(whitelistNaming(123), [preErrata])).toEqual([String(NECROVALLEY)]);
		});
	});

	describe("code this card pool lacks, from another pool", () => {
		const HONEST = 37742478;
		const HONEST_OWN_COPY = 910003001;

		afterEach(() => {
			useForeignPrintings({ originalOf: () => Promise.resolve(null) });
		});

		it("plays the original the other pool says it copies", async () => {
			useForeignPrintings({
				originalOf: (code) => Promise.resolve(code === HONEST_OWN_COPY ? HONEST : null),
			});
			mockCardRepository.findByCode.mockImplementation((code) =>
				Promise.resolve(
					code === String(HONEST)
						? new Card({ code, type: CardTypes.TYPE_MONSTER, alias: "0", category: 0, variant: 0 })
						: null,
				),
			);
			(BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(new EdoproBanList());

			const deck = await deckCreator.build({
				main: [HONEST_OWN_COPY],
				side: [],
				banListHash: 111,
				fromForeignCardPool: true,
			});

			expect(deck.main.map((card) => card.code)).toEqual([String(HONEST)]);
		});

		it("does not ask the other pool for a deck of this pool's own client", async () => {
			const originalOf = jest.fn().mockResolvedValue(HONEST);
			useForeignPrintings({ originalOf });
			mockCardRepository.findByCode.mockResolvedValue(null);
			(BanListMemoryRepository.findByHash as jest.Mock).mockReturnValue(new EdoproBanList());

			const deck = await deckCreator.build({ main: [HONEST_OWN_COPY], side: [], banListHash: 111 });

			expect(originalOf).not.toHaveBeenCalled();
			expect(deck.main).toHaveLength(0);
		});
	});
});
