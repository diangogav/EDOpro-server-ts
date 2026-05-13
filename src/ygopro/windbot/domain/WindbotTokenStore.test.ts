import crypto from "crypto";
import { WindbotTokenStore, WindbotTokenPayload } from "./WindbotTokenStore";

describe("WindbotTokenStore", () => {
	let store: WindbotTokenStore;

	beforeEach(() => {
		store = WindbotTokenStore.createForTests();
	});

	describe("register", () => {
		it("issues a 12-char alphanumeric token", () => {
			const token = store.register(1, "Anna", "Anna.ydk");
			expect(token).toMatch(/^[A-Za-z0-9]{12}$/);
		});

		it("two consecutive register calls return different tokens", () => {
			const token1 = store.register(1, "Anna", "Anna.ydk");
			const token2 = store.register(2, "Gear", "Gear.ydk");
			expect(token1).not.toBe(token2);
		});

		it("stores the payload for later consume", () => {
			const token = store.register(42, "Jill", "Jill.ydk");
			const payload = store.consume(token);
			expect(payload).toEqual<WindbotTokenPayload>({
				roomId: 42,
				botName: "Jill",
				deck: "Jill.ydk",
			});
		});
	});

	describe("consume", () => {
		it("returns the exact payload that was registered", () => {
			const token = store.register(99, "Bot", "bot.ydk");
			const result = store.consume(token);
			expect(result).toEqual<WindbotTokenPayload>({
				roomId: 99,
				botName: "Bot",
				deck: "bot.ydk",
			});
		});

		it("removes the entry (one-shot): second call with same token throws", () => {
			const token = store.register(1, "Anna", "Anna.ydk");
			store.consume(token);
			expect(() => store.consume(token)).toThrow("Windbot token not found");
		});

		it("throws on unknown token", () => {
			expect(() => store.consume("nonexistent01")).toThrow("Windbot token not found");
		});
	});

	describe("clearByRoom", () => {
		it("returns count of removed entries matching roomId", () => {
			store.register(5, "Anna", "Anna.ydk");
			store.register(5, "Gear", "Gear.ydk");
			const count = store.clearByRoom(5);
			expect(count).toBe(2);
		});

		it("does not affect entries for OTHER roomIds", () => {
			const tokenOther = store.register(7, "Bob", "Bob.ydk");
			store.register(5, "Anna", "Anna.ydk");
			store.clearByRoom(5);
			// tokenOther should still be consumable
			expect(store.consume(tokenOther)).toEqual<WindbotTokenPayload>({
				roomId: 7,
				botName: "Bob",
				deck: "Bob.ydk",
			});
		});

		it("returns 0 when roomId has no matching entries", () => {
			const count = store.clearByRoom(999);
			expect(count).toBe(0);
		});
	});

	describe("collision re-roll", () => {
		it("re-rolls when first randomBytes returns a duplicate, returns second unique value", () => {
			// Register a token first using real crypto (not spied yet).
			// existingToken is a 12-char hex string produced by randomBytes(6).toString('hex').
			const existingToken = store.register(1, "Anna", "Anna.ydk");

			// Reconstruct the 6-byte buffer that would produce existingToken when hex-encoded.
			const existingBytes = Buffer.from(existingToken, "hex");

			// A clearly different 6-byte buffer for the second call (all-zeros → "000000000000").
			const freshBytes = Buffer.from("000000000000", "hex");

			const spy = jest
				.spyOn(crypto, "randomBytes")
				.mockImplementationOnce((() => existingBytes) as typeof crypto.randomBytes)
				.mockImplementationOnce((() => freshBytes) as typeof crypto.randomBytes);

			const newToken = store.register(2, "Gear", "Gear.ydk");

			// The duplicate was re-rolled; the second value was used.
			expect(newToken).toBe("000000000000");
			// spy was called exactly twice (one duplicate hit, one fresh value).
			expect(spy).toHaveBeenCalledTimes(2);

			spy.mockRestore();
		});
	});

	describe("createForTests", () => {
		it("returns a fresh isolated instance independent from any other", () => {
			const storeA = WindbotTokenStore.createForTests();
			const storeB = WindbotTokenStore.createForTests();

			const tokenA = storeA.register(1, "Anna", "Anna.ydk");
			// storeB has no knowledge of tokenA
			expect(() => storeB.consume(tokenA)).toThrow("Windbot token not found");
		});
	});
});
