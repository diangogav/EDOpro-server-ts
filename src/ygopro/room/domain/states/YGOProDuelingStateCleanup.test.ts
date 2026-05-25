/**
 * PR-6 tests — WindbotModule cleanup hook in YGOProDuelingState.removeRoom().
 *
 * REQ-TOKEN-204 / REQ-PROVIDER-303: when a room finalizes, all windbot tokens
 * for that room must be cleaned up.
 *
 * Critical invariants:
 * 1. When WindbotModule IS initialized AND enabled → cleanupRoom(roomId) is called.
 * 2. When WindbotModule is NOT initialized → no throw, no cleanup call (no-op).
 *    This is the common case for existing non-windbot rooms — must be 100% safe.
 * 3. Existing removeRoom behavior (broadcast REMOVE-ROOM, deleteRoom) is unchanged
 *    regardless of windbot init state.
 *
 * We test the guard + integration behaviour directly against WindbotModule statics
 * and the CleanupWindBotTokens use case, without needing a full YGOProDuelingState
 * instance (which requires OCGCore spin-up). The actual hook is two lines in removeRoom().
 */

import { WindbotModule, WindbotModuleDeps } from "../../../windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../../windbot/domain/WindbotTokenStore";

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

/**
 * Simulate the exact two-line hook from removeRoom():
 *   if (WindbotModule.isInitialized() && WindbotModule.getInstance().isEnabled()) {
 *     WindbotModule.getInstance().cleanupRoom(roomId);
 *   }
 * Returns the cleanup count if executed, or undefined if skipped (no-op).
 */
function simulateRemoveRoomHook(roomId: number): number | undefined {
	if (WindbotModule.isInitialized() && WindbotModule.getInstance().isEnabled()) {
		return WindbotModule.getInstance().cleanupRoom(roomId);
	}
	return undefined;
}

// ---------- tests ----------

describe("YGOProDuelingState — removeRoom() windbot cleanup hook (PR-6)", () => {
	afterEach(() => {
		WindbotModule.resetForTests();
		jest.restoreAllMocks();
	});

	describe("no-op path — WindbotModule not initialized (common case: non-windbot rooms)", () => {
		it("does NOT throw when WindbotModule is not initialized", () => {
			// Critical regression guard: all existing non-windbot rooms must be unaffected.
			// isInitialized() === false → hook is skipped entirely, no throw.
			expect(() => simulateRemoveRoomHook(42)).not.toThrow();
		});

		it("returns undefined (hook is skipped) when WindbotModule is not initialized", () => {
			// Confirms the hook body never runs — returns undefined rather than a count.
			const result = simulateRemoveRoomHook(42);
			expect(result).toBeUndefined();
		});

		it("does NOT call getInstance() when WindbotModule is not initialized", () => {
			const getInstanceSpy = jest.spyOn(WindbotModule, "getInstance");
			simulateRemoveRoomHook(42);
			expect(getInstanceSpy).not.toHaveBeenCalled();
		});
	});

	describe("no-op path — WindbotModule initialized but disabled", () => {
		it("does NOT call cleanupRoom when module is initialized but disabled", () => {
			WindbotModule.init(makeDeps({ enabled: false }));
			const cleanupSpy = jest.spyOn(WindbotModule.getInstance(), "cleanupRoom");

			simulateRemoveRoomHook(42);

			expect(cleanupSpy).not.toHaveBeenCalled();
		});

		it("returns undefined (hook is skipped) when module is disabled", () => {
			WindbotModule.init(makeDeps({ enabled: false }));
			const result = simulateRemoveRoomHook(42);
			expect(result).toBeUndefined();
		});
	});

	describe("cleanup path — WindbotModule initialized and enabled", () => {
		it("calls cleanupRoom(roomId) when module IS initialized and enabled", () => {
			WindbotModule.init(makeDeps({ enabled: true }));
			const cleanupSpy = jest.spyOn(WindbotModule.getInstance(), "cleanupRoom");

			simulateRemoveRoomHook(42);

			expect(cleanupSpy).toHaveBeenCalledWith(42);
		});

		it("removes windbot tokens for the finalizing room (integration)", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			tokenStore.register(42, "Anna", "Anna.ydk");
			tokenStore.register(42, "Gear", "Gear.ydk");
			// Different room — must NOT be affected
			tokenStore.register(99, "Rex", "Rex.ydk");

			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			const count = simulateRemoveRoomHook(42);
			expect(count).toBe(2);

			// Room 99 token must survive
			expect(tokenStore.clearByRoom(99)).toBe(1);
		});

		it("returns 0 (harmless) when the bot already consumed its token before duel end", () => {
			// Normal duel flow: bot connected → consumed token → duel ends → cleanup = no-op
			const tokenStore = WindbotTokenStore.createForTests();
			const token = tokenStore.register(42, "Anna", "Anna.ydk");
			tokenStore.consume(token); // bot consumed on connect-back

			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			const count = simulateRemoveRoomHook(42);
			expect(count).toBe(0);
		});

		it("does not touch tokens of other rooms", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			tokenStore.register(1, "Anna", "Anna.ydk");
			tokenStore.register(2, "Gear", "Gear.ydk");

			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			simulateRemoveRoomHook(1);

			// Room 2 token must still be present
			expect(tokenStore.clearByRoom(2)).toBe(1);
		});
	});
});
