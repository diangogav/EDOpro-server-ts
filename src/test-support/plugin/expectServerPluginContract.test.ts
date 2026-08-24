import { expectServerPluginContract } from "./expectServerPluginContract";

describe("expectServerPluginContract", () => {
	const validPlugin = {
		name: "basic-stats",
		enabled: () => true,
		register: () => undefined,
	};

	it("does not throw for a conformant plugin", () => {
		expect(() => expectServerPluginContract(validPlugin)).not.toThrow();
	});

	it("throws when register is missing", () => {
		const { register: _register, ...withoutRegister } = validPlugin;

		expect(() => expectServerPluginContract(withoutRegister)).toThrow();
	});

	it("throws when name is an empty string", () => {
		expect(() => expectServerPluginContract({ ...validPlugin, name: "" })).toThrow();
	});
});
