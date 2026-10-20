import {
	BOT_FALLBACK_MAX_MS,
	BOT_FALLBACK_MIN_MS,
	clampBotFallbackDelay,
	MATCHMAKING_FORMATS,
	MatchmakingFormat,
} from "./QueueEntry";

describe("MATCHMAKING_FORMATS", () => {
	it('is exactly ["tcg","jtp","edison"] as a const array', () => {
		expect(MATCHMAKING_FORMATS).toEqual(["tcg", "jtp", "edison"]);
	});

	it("contains only non-empty, unique format strings", () => {
		const seen = new Set<string>();
		for (const fmt of MATCHMAKING_FORMATS) {
			expect(typeof fmt).toBe("string");
			expect(fmt.length).toBeGreaterThan(0);
			expect(seen.has(fmt)).toBe(false);
			seen.add(fmt);
		}
	});
});

describe("MatchmakingFormat", () => {
	it('accepts "tcg" as a valid MatchmakingFormat', () => {
		const fmt: MatchmakingFormat = "tcg";
		expect(MATCHMAKING_FORMATS as readonly string[]).toContain(fmt);
	});

	it('accepts "jtp" as a valid MatchmakingFormat', () => {
		const fmt: MatchmakingFormat = "jtp";
		expect(MATCHMAKING_FORMATS as readonly string[]).toContain(fmt);
	});
});

describe("clampBotFallbackDelay", () => {
	it("raises a delay below the minimum to the minimum", () => {
		expect(clampBotFallbackDelay(0)).toBe(BOT_FALLBACK_MIN_MS);
		expect(clampBotFallbackDelay(BOT_FALLBACK_MIN_MS - 1)).toBe(BOT_FALLBACK_MIN_MS);
	});

	it("lowers a delay above the maximum to the maximum", () => {
		expect(clampBotFallbackDelay(BOT_FALLBACK_MAX_MS + 1)).toBe(BOT_FALLBACK_MAX_MS);
		expect(clampBotFallbackDelay(Number.MAX_SAFE_INTEGER)).toBe(BOT_FALLBACK_MAX_MS);
	});

	it("keeps a delay inside the range unchanged", () => {
		expect(clampBotFallbackDelay(BOT_FALLBACK_MIN_MS)).toBe(BOT_FALLBACK_MIN_MS);
		expect(clampBotFallbackDelay(45_000)).toBe(45_000);
		expect(clampBotFallbackDelay(BOT_FALLBACK_MAX_MS)).toBe(BOT_FALLBACK_MAX_MS);
	});

	it("accepts delays of up to 20 minutes", () => {
		expect(clampBotFallbackDelay(20 * 60_000)).toBe(20 * 60_000);
		expect(clampBotFallbackDelay(20 * 60_000 + 1)).toBe(20 * 60_000);
	});
});
