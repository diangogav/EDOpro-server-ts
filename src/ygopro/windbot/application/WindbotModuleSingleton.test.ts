/**
 * PR-6 tests — WindbotModule singleton guard.
 *
 * isInitialized() must return false before init() is called,
 * and true after. This is the guard used by YGOProDuelingState.removeRoom()
 * to safely skip cleanupRoom() when windbot is not wired up (non-windbot rooms,
 * or the server is running without ENABLE_WINDBOT=true).
 *
 * These tests manipulate the singleton, so they run in their own isolated suite.
 * The afterEach hook resets _instance via the resetForTests() seam.
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

describe("WindbotModule — singleton guard (PR-6)", () => {
	afterEach(() => {
		// Reset singleton so tests do not bleed into each other.
		WindbotModule.resetForTests();
	});

	describe("isInitialized()", () => {
		it("returns false before init() is called", () => {
			expect(WindbotModule.isInitialized()).toBe(false);
		});

		it("returns true after init() is called", () => {
			WindbotModule.init(makeDeps());
			expect(WindbotModule.isInitialized()).toBe(true);
		});

		it("returns false again after resetForTests()", () => {
			WindbotModule.init(makeDeps());
			WindbotModule.resetForTests();
			expect(WindbotModule.isInitialized()).toBe(false);
		});
	});

	describe("getInstance()", () => {
		it("throws when not initialized", () => {
			expect(() => WindbotModule.getInstance()).toThrow(
				"WindbotModule not initialized — call WindbotModule.init() first",
			);
		});

		it("returns the initialized instance", () => {
			WindbotModule.init(makeDeps());
			expect(WindbotModule.getInstance()).toBeDefined();
		});
	});

	describe("resetForTests()", () => {
		it("clears the singleton so init() can be called again", () => {
			WindbotModule.init(makeDeps());
			WindbotModule.resetForTests();
			// Should not throw — init() is callable again
			expect(() => WindbotModule.init(makeDeps())).not.toThrow();
		});
	});
});
