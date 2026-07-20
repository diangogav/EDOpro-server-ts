import { WindbotModule, WindbotModuleDeps } from "./WindbotModule";
import { WindbotData } from "../domain/WindbotData";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";
import { FileBotlistRepository } from "../infrastructure/FileBotlistRepository";
import { WindbotBotlistRepository } from "../domain/WindbotBotlistRepository";
import { WindbotUnreachableError } from "../domain/WindbotErrors";

// ---------- test helpers ----------

const makeBot = (overrides: Partial<WindbotData> = {}): WindbotData => ({
	name: "Anna",
	deck: "Anna.ydk",
	...overrides,
});

const makeRepo = (overrides: Partial<WindbotBotlistRepository> = {}): WindbotBotlistRepository => ({
	findAll: jest.fn().mockReturnValue([makeBot()]),
	findByName: jest.fn().mockReturnValue(makeBot()),
	pickRandom: jest.fn().mockReturnValue(makeBot()),
	...overrides,
});

const makeProvider = (): { requestJoin: jest.Mock } => ({
	requestJoin: jest.fn().mockResolvedValue(undefined),
});

const makeDeps = (overrides: Partial<WindbotModuleDeps> = {}): WindbotModuleDeps => ({
	enabled: true,
	repo: makeRepo(),
	tokenStore: WindbotTokenStore.createForTests(),
	provider: makeProvider() as unknown as WindbotModuleDeps["provider"],
	...overrides,
});

// ---------- tests ----------

describe("WindbotModule", () => {
	describe("isEnabled()", () => {
		it("returns true when created with enabled: true", () => {
			const mod = WindbotModule.createForTests(makeDeps({ enabled: true }));
			expect(mod.isEnabled()).toBe(true);
		});

		it("returns false when created with enabled: false", () => {
			const mod = WindbotModule.createForTests(makeDeps({ enabled: false }));
			expect(mod.isEnabled()).toBe(false);
		});
	});

	describe("requestBot()", () => {
		it("registers token via RequestWindBotJoin and fires HTTP via provider", async () => {
			const provider = makeProvider();
			const mod = WindbotModule.createForTests(
				makeDeps({ provider: provider as unknown as WindbotModuleDeps["provider"] }),
			);

			const result = await mod.requestBot(42, "Anna", () => false);

			expect(result.token).toMatch(/^[A-Za-z0-9]{12}$/);
			expect(result.bot.name).toBe("Anna");
			expect(provider.requestJoin).toHaveBeenCalledTimes(1);
		});

		it("passes isFinalizing callback to provider.requestJoin", async () => {
			const provider = makeProvider();
			const isFinalizing = jest.fn().mockReturnValue(false);
			const mod = WindbotModule.createForTests(
				makeDeps({ provider: provider as unknown as WindbotModuleDeps["provider"] }),
			);

			await mod.requestBot(42, null, isFinalizing);

			const call = provider.requestJoin.mock.calls[0][0];
			// The isFinalizing callback must be wired
			expect(typeof call.isFinalizing).toBe("function");
		});

		it("cleans up registered token when provider.requestJoin throws", async () => {
			const unreachable = new WindbotUnreachableError("Anna", 10);
			const provider = makeProvider();
			provider.requestJoin.mockRejectedValue(unreachable);

			const tokenStore = WindbotTokenStore.createForTests();
			const mod = WindbotModule.createForTests(
				makeDeps({
					provider: provider as unknown as WindbotModuleDeps["provider"],
					tokenStore,
				}),
			);

			await expect(mod.requestBot(42, "Anna", () => false)).rejects.toThrow(
				WindbotUnreachableError,
			);

			// Token must be cleaned up — clearByRoom returns 0 because token was already removed
			const cleaned = tokenStore.clearByRoom(42);
			expect(cleaned).toBe(0);
		});

		it("rethrows the provider error after cleanup", async () => {
			const unreachable = new WindbotUnreachableError("Anna", 10);
			const provider = makeProvider();
			provider.requestJoin.mockRejectedValue(unreachable);
			const mod = WindbotModule.createForTests(
				makeDeps({ provider: provider as unknown as WindbotModuleDeps["provider"] }),
			);

			await expect(mod.requestBot(42, "Anna", () => false)).rejects.toBe(unreachable);
		});

		it("forwards deckOverride to the provider so the bot plays the requested deck", async () => {
			const provider = makeProvider();
			// pickRandom returns a non-TCG bot; the override must replace its deck.
			const repo = makeRepo({
				pickRandom: jest.fn().mockReturnValue(makeBot({ name: "Joey", deck: "JTP" })),
			});
			const mod = WindbotModule.createForTests(
				makeDeps({ provider: provider as unknown as WindbotModuleDeps["provider"], repo }),
			);

			const result = await mod.requestBot(7, null, () => false, "Salamangreat");

			const call = provider.requestJoin.mock.calls[0][0];
			expect(call.bot.deck).toBe("Salamangreat");
			expect(result.bot.deck).toBe("Salamangreat");
			// The bot identity (name) is preserved; only the deck is overridden.
			expect(result.bot.name).toBe("Joey");
		});

		it("uses the bot's own deck when no deckOverride is given", async () => {
			const provider = makeProvider();
			const repo = makeRepo({
				pickRandom: jest.fn().mockReturnValue(makeBot({ name: "Joey", deck: "JTP" })),
			});
			const mod = WindbotModule.createForTests(
				makeDeps({ provider: provider as unknown as WindbotModuleDeps["provider"], repo }),
			);

			const result = await mod.requestBot(7, null, () => false);

			const call = provider.requestJoin.mock.calls[0][0];
			expect(call.bot.deck).toBe("JTP");
			expect(result.bot.deck).toBe("JTP");
		});

		it("selects random bot when botNameOrNull is null", async () => {
			const provider = makeProvider();
			const randomBot = makeBot({ name: "Gear", deck: "Gear.ydk" });
			const repo = makeRepo({ pickRandom: jest.fn().mockReturnValue(randomBot) });
			const mod = WindbotModule.createForTests(
				makeDeps({ provider: provider as unknown as WindbotModuleDeps["provider"], repo }),
			);

			const result = await mod.requestBot(1, null, () => false);

			expect(result.bot.name).toBe("Gear");
		});
	});

	describe("consumeToken()", () => {
		it("returns the payload for a registered token", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			const token = tokenStore.register(10, "Anna", "Anna.ydk");
			const mod = WindbotModule.createForTests(makeDeps({ tokenStore }));

			const payload = mod.consumeToken(token);
			expect(payload.roomId).toBe(10);
			expect(payload.botName).toBe("Anna");
		});

		it("throws when token is unknown", () => {
			const mod = WindbotModule.createForTests(makeDeps());
			expect(() => mod.consumeToken("nonexistent")).toThrow("Windbot token not found");
		});
	});

	describe("cleanupRoom()", () => {
		it("returns the count of tokens cleared for the room", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			tokenStore.register(7, "Anna", "Anna.ydk");
			tokenStore.register(7, "Gear", "Gear.ydk");
			const mod = WindbotModule.createForTests(makeDeps({ tokenStore }));

			const count = mod.cleanupRoom(7);
			expect(count).toBe(2);
		});

		it("returns 0 when no tokens exist for the room", () => {
			const mod = WindbotModule.createForTests(makeDeps());
			const count = mod.cleanupRoom(99);
			expect(count).toBe(0);
		});

		it("does not affect tokens of other rooms", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			tokenStore.register(1, "Anna", "Anna.ydk");
			tokenStore.register(2, "Gear", "Gear.ydk");
			const mod = WindbotModule.createForTests(makeDeps({ tokenStore }));

			mod.cleanupRoom(1);

			// Room 2 token still exists
			const count = tokenStore.clearByRoom(2);
			expect(count).toBe(1);
		});
	});
});
