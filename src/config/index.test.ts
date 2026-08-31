/**
 * The JOIN rate-limit knob must honor any explicit numeric value an operator
 * sets — including 0 (deny every join) — and fall back to the default only
 * when the variable is unset or non-numeric.
 */

const loadConfig = (): typeof import("./index").config => {
	let loaded: typeof import("./index").config | undefined;
	jest.isolateModules(() => {
		// biome-ignore lint/style/noCommonJs: jest.isolateModules needs a synchronous require to re-read env at import time
		loaded = (require("./index") as typeof import("./index")).config;
	});
	if (!loaded) {
		throw new Error("config failed to load");
	}

	return loaded;
};

describe("config.rateLimit.join.limit", () => {
	const originalValue = process.env.RATE_LIMIT_JOIN;

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env.RATE_LIMIT_JOIN;
		} else {
			process.env.RATE_LIMIT_JOIN = originalValue;
		}
	});

	it("defaults to 60 when unset", () => {
		delete process.env.RATE_LIMIT_JOIN;
		expect(loadConfig().rateLimit.join.limit).toBe(60);
	});

	it("defaults to 60 when non-numeric", () => {
		process.env.RATE_LIMIT_JOIN = "plenty";
		expect(loadConfig().rateLimit.join.limit).toBe(60);
	});

	it("honors an explicit 0 instead of folding it into the default", () => {
		process.env.RATE_LIMIT_JOIN = "0";
		expect(loadConfig().rateLimit.join.limit).toBe(0);
	});

	it("honors any other explicit numeric value", () => {
		process.env.RATE_LIMIT_JOIN = "7";
		expect(loadConfig().rateLimit.join.limit).toBe(7);
	});
});

describe("config.rankGroups.path", () => {
	const originalValue = process.env.RANK_GROUPS_PATH;

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env.RANK_GROUPS_PATH;
		} else {
			process.env.RANK_GROUPS_PATH = originalValue;
		}
	});

	it("defaults to the repository seed file when unset", () => {
		delete process.env.RANK_GROUPS_PATH;
		expect(loadConfig().rankGroups.path).toBe("./config/rank-groups.json");
	});

	it("honors an explicit RANK_GROUPS_PATH override", () => {
		process.env.RANK_GROUPS_PATH = "/etc/evolution/rank-groups.json";
		expect(loadConfig().rankGroups.path).toBe("/etc/evolution/rank-groups.json");
	});
});
