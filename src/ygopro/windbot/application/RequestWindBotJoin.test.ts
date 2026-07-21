import { RequestWindBotJoin } from "./RequestWindBotJoin";
import { WindbotBotlistRepository } from "../domain/WindbotBotlistRepository";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";
import { WindbotData } from "../domain/WindbotData";
import { WindbotNotFoundError } from "../domain/WindbotErrors";
import { WindbotsExhaustedError } from "../domain/WindbotErrors";

const makeBot = (overrides: Partial<WindbotData> = {}): WindbotData => ({
	name: "Anna",
	deck: "Anna.ydk",
	...overrides,
});

const makeRepo = (overrides: Partial<WindbotBotlistRepository> = {}): WindbotBotlistRepository => ({
	findAll: jest.fn().mockReturnValue([]),
	findByName: jest.fn().mockReturnValue(null),
	pickRandom: jest.fn().mockReturnValue(null),
	...overrides,
});

describe("RequestWindBotJoin", () => {
	let tokenStore: WindbotTokenStore;

	beforeEach(() => {
		tokenStore = WindbotTokenStore.createForTests();
	});

	describe("named bot lookup", () => {
		it("returns { token, bot } when repo finds the bot by name", () => {
			const bot = makeBot();
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const result = useCase.execute(42, "Anna");

			expect(result.bot).toBe(bot);
			expect(result.token).toMatch(/^[A-Za-z0-9]{12}$/);
		});

		it("throws WindbotNotFoundError when named bot is not in the list", () => {
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(null) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			expect(() => useCase.execute(1, "Unknown")).toThrow(WindbotNotFoundError);
		});

		it("registers the token with the correct roomId", () => {
			const bot = makeBot();
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const { token } = useCase.execute(99, "Anna");

			const payload = tokenStore.consume(token);
			expect(payload.roomId).toBe(99);
		});

		it("registers token with bot.deck when no deckOverride provided", () => {
			const bot = makeBot({ deck: "Anna.ydk" });
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const { token } = useCase.execute(1, "Anna");

			const payload = tokenStore.consume(token);
			expect(payload.deck).toBe("Anna.ydk");
		});

		it("registers token with deckOverride when provided", () => {
			const bot = makeBot({ deck: "Anna.ydk" });
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const { token } = useCase.execute(1, "Anna", "CustomDeck.ydk");

			const payload = tokenStore.consume(token);
			expect(payload.deck).toBe("CustomDeck.ydk");
		});

		it("clears deckcode on override so windbot cannot ignore the override deck", () => {
			// windbot honors `deckcode` over `deck`. If the source bot carries a
			// deckcode, the returned bot MUST drop it so the override actually applies
			// (otherwise the bot plays its original, possibly non-TCG deck → deck-check
			// ejection). See RequestWindBotJoin W1 fix.
			const bot = makeBot({ deck: "Anna.ydk", deckcode: "SomeBase64OriginalDeck" });
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const result = useCase.execute(1, "Anna", "CustomDeck.ydk");

			expect(result.bot.deck).toBe("CustomDeck.ydk");
			expect(result.bot.deckcode).toBeUndefined();
		});

		it("preserves deckcode when no override is provided", () => {
			// The no-override path must NOT mutate the source bot's deckcode.
			const bot = makeBot({ deck: "Anna.ydk", deckcode: "SomeBase64OriginalDeck" });
			const repo = makeRepo({ findByName: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const result = useCase.execute(1, "Anna");

			expect(result.bot.deckcode).toBe("SomeBase64OriginalDeck");
		});
	});

	describe("random bot selection", () => {
		it("returns { token, bot } from pickRandom when botName is null", () => {
			const bot = makeBot({ name: "Gear", deck: "Gear.ydk" });
			const repo = makeRepo({ pickRandom: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const result = useCase.execute(5, null);

			expect(result.bot).toBe(bot);
			expect(result.token).toMatch(/^[A-Za-z0-9]{12}$/);
		});

		it("throws WindbotsExhaustedError when pickRandom returns null", () => {
			const repo = makeRepo({ pickRandom: jest.fn().mockReturnValue(null) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			expect(() => useCase.execute(1, null)).toThrow(WindbotsExhaustedError);
		});

		it("registers token with bot.deck when no deckOverride and using random selection", () => {
			const bot = makeBot({ name: "Gear", deck: "Gear.ydk" });
			const repo = makeRepo({ pickRandom: jest.fn().mockReturnValue(bot) });
			const useCase = new RequestWindBotJoin(repo, tokenStore);

			const { token } = useCase.execute(7, null);

			const payload = tokenStore.consume(token);
			expect(payload.deck).toBe("Gear.ydk");
		});
	});
});
