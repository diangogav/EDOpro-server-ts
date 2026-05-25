/**
 * PR-7 tests — WindbotModule.cleanupRoomIfEnabled() static helper.
 *
 * This helper centralises the two-line guard pattern:
 *   if (WindbotModule.isInitialized() && WindbotModule.getInstance().isEnabled()) {
 *     WindbotModule.getInstance().cleanupRoom(roomId);
 *   }
 *
 * It is called from BOTH:
 *   - YGOProDuelingState.removeRoom() (PR-6, already calls cleanupRoom directly — updated in PR-7)
 *   - DisconnectHandler.handleYGOPro() (PR-7 gap fix)
 *
 * Invariants:
 *   1. No-op (returns 0) when WindbotModule is not initialized — NO throw.
 *   2. No-op (returns 0) when WindbotModule is initialized but disabled.
 *   3. Calls cleanupRoom(roomId) when initialized AND enabled.
 *   4. Is safe to call multiple times (idempotent after first call clears tokens).
 */

import { WindbotModule, WindbotModuleDeps } from "./WindbotModule";
import { WindbotTokenStore } from "../domain/WindbotTokenStore";

// ---------- helpers ----------

const makeRepo = () => ({
	findAll: jest.fn().mockReturnValue([]),
	findByName: jest.fn().mockReturnValue(undefined),
	pickRandom: jest.fn().mockReturnValue(undefined),
});

const makeProvider = () => ({
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

describe("WindbotModule.cleanupRoomIfEnabled() — PR-7 static helper", () => {
	afterEach(() => {
		WindbotModule.resetForTests();
		jest.restoreAllMocks();
	});

	describe("no-op path — not initialized", () => {
		it("does NOT throw when WindbotModule is not initialized", () => {
			expect(() => WindbotModule.cleanupRoomIfEnabled(42)).not.toThrow();
		});

		it("returns 0 (no tokens removed) when not initialized", () => {
			const result = WindbotModule.cleanupRoomIfEnabled(42);
			expect(result).toBe(0);
		});

		it("does NOT call getInstance() when not initialized", () => {
			const spy = jest.spyOn(WindbotModule, "getInstance");
			WindbotModule.cleanupRoomIfEnabled(42);
			expect(spy).not.toHaveBeenCalled();
		});
	});

	describe("no-op path — initialized but disabled", () => {
		it("returns 0 when module is initialized but disabled", () => {
			WindbotModule.init(makeDeps({ enabled: false }));
			const result = WindbotModule.cleanupRoomIfEnabled(42);
			expect(result).toBe(0);
		});

		it("does NOT call cleanupRoom when module is disabled", () => {
			WindbotModule.init(makeDeps({ enabled: false }));
			const cleanupSpy = jest.spyOn(WindbotModule.getInstance(), "cleanupRoom");
			WindbotModule.cleanupRoomIfEnabled(42);
			expect(cleanupSpy).not.toHaveBeenCalled();
		});
	});

	describe("cleanup path — initialized and enabled", () => {
		it("calls cleanupRoom(roomId) when initialized and enabled", () => {
			WindbotModule.init(makeDeps({ enabled: true }));
			const cleanupSpy = jest.spyOn(WindbotModule.getInstance(), "cleanupRoom");

			WindbotModule.cleanupRoomIfEnabled(42);

			expect(cleanupSpy).toHaveBeenCalledWith(42);
		});

		it("removes windbot tokens for the given room (integration)", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			tokenStore.register(42, "Anna", "Anna.ydk");
			tokenStore.register(42, "Gear", "Gear.ydk");
			// Different room — must NOT be affected
			tokenStore.register(99, "Rex", "Rex.ydk");

			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			const count = WindbotModule.cleanupRoomIfEnabled(42);
			expect(count).toBe(2);

			// Room 99 token must survive
			expect(tokenStore.clearByRoom(99)).toBe(1);
		});

		it("returns 0 (harmless) when the bot already consumed its token", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			const token = tokenStore.register(42, "Anna", "Anna.ydk");
			tokenStore.consume(token); // already consumed

			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			const count = WindbotModule.cleanupRoomIfEnabled(42);
			expect(count).toBe(0);
		});

		it("is safe to call twice for the same room (idempotent)", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			tokenStore.register(42, "Anna", "Anna.ydk");

			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			WindbotModule.cleanupRoomIfEnabled(42);
			expect(() => WindbotModule.cleanupRoomIfEnabled(42)).not.toThrow();
			// Second call returns 0 (already cleaned)
			expect(WindbotModule.cleanupRoomIfEnabled(42)).toBe(0);
		});
	});
});
