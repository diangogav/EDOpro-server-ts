import { JoinContext } from "./JoinStrategy";
import { isPairingJoin } from "./isPairingJoin";

const makeCtx = (rawPass: string): JoinContext => {
	const [command, password = ""] = rawPass.split("#");
	return { rawPass, command, password } as unknown as JoinContext;
};

/**
 * A join is a PAIRING JOIN when the password segment is empty, the command
 * is non-empty, AND every comma-separated token (trimmed, lowercased) is
 * either isRecognizedToken(token) or the literal "casual".
 */
describe("isPairingJoin", () => {
	it("is a pairing join for a single recognized token", () => {
		expect(isPairingJoin(makeCtx("TCG"))).toBe(true);
		expect(isPairingJoin(makeCtx("tcg"))).toBe(true);
	});

	it("is a pairing join for multiple recognized tokens", () => {
		expect(isPairingJoin(makeCtx("edison,ns"))).toBe(true);
	});

	it('treats "casual" as recognized even though it is not a rule token', () => {
		expect(isPairingJoin(makeCtx("tcg,casual"))).toBe(true);
	});

	it("is NOT a pairing join when a password segment is present", () => {
		expect(isPairingJoin(makeCtx("tcg#torneo"))).toBe(false);
		expect(isPairingJoin(makeCtx("edison#torneo"))).toBe(false);
	});

	it('is NOT a pairing join when the command is blank ("#pass" or "")', () => {
		expect(isPairingJoin(makeCtx(""))).toBe(false);
		expect(isPairingJoin(makeCtx("#pass"))).toBe(false);
	});

	it("is NOT a pairing join when any token is unrecognized", () => {
		expect(isPairingJoin(makeCtx("salaDeJuan"))).toBe(false);
		// "tm" with no digits does not match /^(tm|time)\d+$/ — unrecognized.
		expect(isPairingJoin(makeCtx("edison,ns,tm"))).toBe(false);
	});

	it('is NOT a pairing join for the "ai" token', () => {
		expect(isPairingJoin(makeCtx("ai"))).toBe(false);
	});

	it("is NOT a pairing join for a matchmaking marker token", () => {
		expect(isPairingJoin(makeCtx("tcg,mm12345"))).toBe(false);
	});

	it("is a pairing join for tag-mode tokens", () => {
		expect(isPairingJoin(makeCtx("t,edison"))).toBe(true);
	});

	it("trims and lowercases tokens before recognition", () => {
		expect(isPairingJoin(makeCtx(" TCG , NS "))).toBe(true);
	});

	// A trailing/double comma produces an EMPTY token after split(","), and
	// isRecognizedToken("") is false (not "casual" either), so `.every()`
	// would silently disqualify the whole command as a pairing join even
	// though every non-empty token was perfectly recognized. Empty tokens
	// must be filtered out BEFORE the recognition check — the pairing LOOKUP
	// KEY is unaffected: it stays the raw, unfiltered command string
	// (findOrCreateRoom uses ctx.command directly), so "tcg," only pairs with
	// another literal "tcg,", never with "tcg".
	describe("empty tokens from trailing/double commas", () => {
		it("is a pairing join for a trailing comma", () => {
			expect(isPairingJoin(makeCtx("tcg,"))).toBe(true);
		});

		it("is a pairing join for a double comma in the middle", () => {
			expect(isPairingJoin(makeCtx("tcg,,ns"))).toBe(true);
		});

		it("is NOT a pairing join when every token is empty (bare commas only)", () => {
			expect(isPairingJoin(makeCtx(","))).toBe(false);
			expect(isPairingJoin(makeCtx(",,"))).toBe(false);
		});

		it("is a pairing join for bare 'casual' and for 'casual' combined with a recognized token", () => {
			expect(isPairingJoin(makeCtx("casual"))).toBe(true);
			expect(isPairingJoin(makeCtx("casual,tcg"))).toBe(true);
		});
	});
});
