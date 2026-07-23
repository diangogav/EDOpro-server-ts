import { MATCHMAKING_FORMATS, MatchmakingFormat } from "./QueueEntry";

describe("MATCHMAKING_FORMATS", () => {
	it('is exactly ["tcg","jtp"] as a const array', () => {
		expect(MATCHMAKING_FORMATS).toEqual(["tcg", "jtp"]);
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
