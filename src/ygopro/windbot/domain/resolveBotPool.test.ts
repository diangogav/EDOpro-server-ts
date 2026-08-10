import { resolveBotPool } from "./resolveBotPool";

describe("resolveBotPool", () => {
	it.each([
		["jtp", "jtp"],
		["jm", "jtp"],
		["edison", "edison"],
		["ed", "edison"],
		["tt", "tcg"],
		["toot", "tcg"],
		["tr", "tcg"],
		["tmr", "tcg"],
		["tomr", "tcg"],
		["pre", "tcg"],
	])('maps token "%s" to pool "%s"', (token, pool) => {
		expect(resolveBotPool([token])).toBe(pool);
	});

	it("is case-insensitive", () => {
		expect(resolveBotPool(["ED"])).toBe("edison");
		expect(resolveBotPool(["JTP"])).toBe("jtp");
	});

	it("returns null for unknown tokens (generic pool)", () => {
		expect(resolveBotPool(["nc", "ns"])).toBeNull();
	});

	it("returns null for an empty token list", () => {
		expect(resolveBotPool([])).toBeNull();
	});

	it.each([
		"constructor",
		"__proto__",
		"toString",
		"valueOf",
		"hasOwnProperty",
	])('returns null for the prototype-colliding token "%s" instead of a prototype member', (token) => {
		expect(resolveBotPool([token])).toBeNull();
	});

	it("picks the first matching FORMAT-tier token when no priority-tier token is present", () => {
		// "jtp" (format) appears before "ed" (format) — first match wins within the tier.
		expect(resolveBotPool(["nc", "jtp", "ed"])).toBe("jtp");
	});

	it("ignores non-mapping tokens interspersed with a mapping one", () => {
		expect(resolveBotPool(["nc", "ns", "jtp"])).toBe("jtp");
	});

	describe("tier precedence (priority-tier ALWAYS overrides format-tier)", () => {
		// Mirrors YGOProRoom.create applying ruleMappings -> formatRuleMappings ->
		// priorityRuleMappings, where priority tokens always win regardless of
		// position in the join string.
		it('"ed,tt,ai" resolves to the priority-tier pool ("tcg"), not the format-tier one', () => {
			expect(resolveBotPool(["ed", "tt", "ai"])).toBe("tcg");
		});

		it('"tt,ed,ai" also resolves to "tcg" (order-independent)', () => {
			expect(resolveBotPool(["tt", "ed", "ai"])).toBe("tcg");
		});

		it('"ed,ai" (no priority-tier token) resolves to the format-tier pool ("edison")', () => {
			expect(resolveBotPool(["ed", "ai"])).toBe("edison");
		});
	});
});
