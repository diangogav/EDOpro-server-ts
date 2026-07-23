import { MATCHMAKING_FORMATS } from "../QueueEntry";
import { pickBotFromRoster, MATCHMAKING_BOT_ROSTER } from "../MatchmakingBotRoster";

describe("MATCHMAKING_BOT_ROSTER", () => {
	it("has a roster for every format in MATCHMAKING_FORMATS", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			expect(MATCHMAKING_BOT_ROSTER[fmt]).toBeDefined();
			expect(Array.isArray(MATCHMAKING_BOT_ROSTER[fmt])).toBe(true);
			expect(MATCHMAKING_BOT_ROSTER[fmt].length).toBeGreaterThan(0);
		}
	});

	it("tcg roster has exactly 7 entries", () => {
		expect(MATCHMAKING_BOT_ROSTER.tcg.length).toBe(7);
	});

	it("jtp roster has exactly 2 entries", () => {
		expect(MATCHMAKING_BOT_ROSTER.jtp.length).toBe(2);
	});

	it("all roster entries have non-empty name and deck strings", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			for (const pair of MATCHMAKING_BOT_ROSTER[fmt]) {
				expect(typeof pair.name).toBe("string");
				expect(pair.name.length).toBeGreaterThan(0);
				expect(typeof pair.deck).toBe("string");
				expect(pair.deck.length).toBeGreaterThan(0);
			}
		}
	});

	it("jtp roster contains (Joey, JTP) and (Yugi, Yugi)", () => {
		const jtp = MATCHMAKING_BOT_ROSTER.jtp;
		expect(jtp[0]).toEqual({ name: "Joey", deck: "JTP" });
		expect(jtp[1]).toEqual({ name: "Yugi", deck: "Yugi" });
	});
});

describe("pickBotFromRoster", () => {
	it("returns a { name, deck } object for tcg format", () => {
		const pair = pickBotFromRoster("tcg", Math.random);
		expect(typeof pair.name).toBe("string");
		expect(pair.name.length).toBeGreaterThan(0);
		expect(typeof pair.deck).toBe("string");
		expect(pair.deck.length).toBeGreaterThan(0);
	});

	it('pickBotFromRoster("jtp", 0) returns (Joey, JTP)', () => {
		const pair = pickBotFromRoster("jtp", () => 0);
		expect(pair).toEqual({ name: "Joey", deck: "JTP" });
	});

	it('pickBotFromRoster("jtp", 1) returns (Yugi, Yugi)', () => {
		// seed = 1.0 → clamped to last index → Yugi
		const pair = pickBotFromRoster("jtp", () => 1);
		expect(pair).toEqual({ name: "Yugi", deck: "Yugi" });
	});

	it("name and deck always come from the same pair — no cross-mix", () => {
		const pairs = MATCHMAKING_BOT_ROSTER.tcg;
		for (let i = 0; i < pairs.length; i++) {
			const picked = pickBotFromRoster("tcg", () => i / pairs.length);
			const expected = pairs[i];
			// name and deck must belong to the SAME roster entry
			expect(picked.name).toBe(expected.name);
			expect(picked.deck).toBe(expected.deck);
		}
	});

	it("always returns a member of the roster for the given format", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
				const pair = pickBotFromRoster(fmt, () => r);
				const roster = MATCHMAKING_BOT_ROSTER[fmt];
				expect(roster).toContainEqual(pair);
			}
		}
	});
});
