import { isServerPlugin } from "./isServerPlugin";

describe("isServerPlugin", () => {
	const validPlugin = {
		name: "basic-stats",
		enabled: () => true,
		register: () => undefined,
	};

	it.each([
		["missing name", { enabled: validPlugin.enabled, register: validPlugin.register }],
		["missing enabled", { name: validPlugin.name, register: validPlugin.register }],
		["missing register", { name: validPlugin.name, enabled: validPlugin.enabled }],
		["name is not a string", { ...validPlugin, name: 42 }],
		["enabled is not a function", { ...validPlugin, enabled: true }],
		["register is not a function", { ...validPlugin, register: "not-a-function" }],
		["value is null", null],
		["value is undefined", undefined],
		["value is a primitive", "not-an-object"],
	])("returns false when %s", (_description, candidate) => {
		expect(isServerPlugin(candidate)).toBe(false);
	});

	it("returns true for a conformant plugin shape", () => {
		expect(isServerPlugin(validPlugin)).toBe(true);
	});

	it("returns true when register returns a Promise<void>", () => {
		expect(isServerPlugin({ ...validPlugin, register: async () => undefined })).toBe(true);
	});

	describe("lifecycleHooks declaration", () => {
		it("returns true when lifecycleHooks is absent", () => {
			expect(isServerPlugin(validPlugin)).toBe(true);
		});

		it("returns true for an array of conformant hook shapes", () => {
			expect(
				isServerPlugin({
					...validPlugin,
					lifecycleHooks: [{ name: "rating-announcer" }],
				}),
			).toBe(true);
		});

		it("returns true for an empty declaration", () => {
			expect(isServerPlugin({ ...validPlugin, lifecycleHooks: [] })).toBe(true);
		});

		it.each([
			["not an array", { name: "x" }],
			["an entry with no name", [{}]],
			["an entry whose name is not a string", [{ name: 42 }]],
		])("returns false when lifecycleHooks is %s", (_description, lifecycleHooks) => {
			expect(isServerPlugin({ ...validPlugin, lifecycleHooks })).toBe(false);
		});
	});

	describe("duelEvents declaration", () => {
		it("returns true when duelEvents is absent", () => {
			expect(isServerPlugin(validPlugin)).toBe(true);
		});

		it("returns true for an array of known duel-event kinds", () => {
			expect(
				isServerPlugin({ ...validPlugin, duelEvents: ["duel.damage", "duel.turn-start"] }),
			).toBe(true);
		});

		it("returns true for an empty declaration", () => {
			expect(isServerPlugin({ ...validPlugin, duelEvents: [] })).toBe(true);
		});

		it.each([
			["not an array", "duel.damage"],
			["an unknown kind", ["duel.damage", "duel.unknown"]],
			["a non-string entry", [42]],
		])("returns false when duelEvents is %s", (_description, duelEvents) => {
			expect(isServerPlugin({ ...validPlugin, duelEvents })).toBe(false);
		});
	});
});
