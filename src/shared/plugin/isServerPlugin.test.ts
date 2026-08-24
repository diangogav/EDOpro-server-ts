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
});
