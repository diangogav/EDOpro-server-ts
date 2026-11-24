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

describe("config.verifiedAccount.cutoff", () => {
	const originalValue = process.env.VERIFIED_ACCOUNT_CUTOFF;

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env.VERIFIED_ACCOUNT_CUTOFF;
		} else {
			process.env.VERIFIED_ACCOUNT_CUTOFF = originalValue;
		}
	});

	it("is null when unset", () => {
		delete process.env.VERIFIED_ACCOUNT_CUTOFF;
		expect(loadConfig().verifiedAccount.cutoff).toBeNull();
	});

	it("parses an ISO date", () => {
		process.env.VERIFIED_ACCOUNT_CUTOFF = "2026-12-01T00:00:00Z";
		expect(loadConfig().verifiedAccount.cutoff?.toISOString()).toBe("2026-12-01T00:00:00.000Z");
	});

	it("is null when the value is not a date", () => {
		process.env.VERIFIED_ACCOUNT_CUTOFF = "soon";
		expect(loadConfig().verifiedAccount.cutoff).toBeNull();
	});
});

describe("config.verifiedAccount.chatRequired", () => {
	const originalValue = process.env.VERIFIED_CHAT_REQUIRED;

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env.VERIFIED_CHAT_REQUIRED;
		} else {
			process.env.VERIFIED_CHAT_REQUIRED = originalValue;
		}
	});

	it("is false when unset", () => {
		delete process.env.VERIFIED_CHAT_REQUIRED;
		expect(loadConfig().verifiedAccount.chatRequired).toBe(false);
	});

	it.each(["true", "1", "TRUE", " True "])("is true for %p", (value) => {
		process.env.VERIFIED_CHAT_REQUIRED = value;
		expect(loadConfig().verifiedAccount.chatRequired).toBe(true);
	});

	it.each(["yes", "false", "0", ""])("is false for %p", (value) => {
		process.env.VERIFIED_CHAT_REQUIRED = value;
		expect(loadConfig().verifiedAccount.chatRequired).toBe(false);
	});
});

describe("config.verifiedAccount.rankedRequired", () => {
	const originalValue = process.env.VERIFIED_RANKED_REQUIRED;

	afterEach(() => {
		if (originalValue === undefined) {
			delete process.env.VERIFIED_RANKED_REQUIRED;
		} else {
			process.env.VERIFIED_RANKED_REQUIRED = originalValue;
		}
	});

	it("is false when unset", () => {
		delete process.env.VERIFIED_RANKED_REQUIRED;
		expect(loadConfig().verifiedAccount.rankedRequired).toBe(false);
	});

	it.each(["true", "1", "TRUE", " True "])("is true for %p", (value) => {
		process.env.VERIFIED_RANKED_REQUIRED = value;
		expect(loadConfig().verifiedAccount.rankedRequired).toBe(true);
	});

	it.each(["yes", "false", "0", ""])("is false for %p", (value) => {
		process.env.VERIFIED_RANKED_REQUIRED = value;
		expect(loadConfig().verifiedAccount.rankedRequired).toBe(false);
	});
});
