/**
 * Wire-budget guard for per-format room tokens.
 *
 * The CTOS_JOIN_GAME { pass } field is a FIXED utf16[20] buffer. Any join string
 * longer than 19 UTF-16 chars is silently truncated on encode, destroying the
 * "#password" segment and breaking the human join.
 *
 * Layout within the 19-char budget:
 *   "<token>," + "mm" + 5 base36 (7) + "#" (1) + 7 base36 (7)
 *   = token.length + 1 + 7 + 1 + 7 = token.length + 16
 *   ≤ 19 ⟹ token.length ≤ 3
 *
 * This test asserts both that FORMAT_ROOM_TOKEN exists for every format and
 * that the constructed join string never exceeds the 19-char ceiling.
 */
import { MATCHMAKING_FORMATS } from "../QueueEntry";
import { FORMAT_ROOM_TOKEN } from "../../application/MatchmakingRoomFactory";

const NAME_ENTROPY_CHARS = 5; // mm + 5 = 7 chars for the room name suffix
const PASSWORD_CHARS = 7;

function maxJoinStringLength(token: string): number {
	// Worst-case: token + "," + "mm" + NAME_ENTROPY_CHARS + "#" + PASSWORD_CHARS
	return token.length + 1 + 2 + NAME_ENTROPY_CHARS + 1 + PASSWORD_CHARS;
}

describe("FORMAT_ROOM_TOKEN", () => {
	it("has an entry for every format in MATCHMAKING_FORMATS", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			expect(FORMAT_ROOM_TOKEN[fmt]).toBeDefined();
			expect(typeof FORMAT_ROOM_TOKEN[fmt]).toBe("string");
			expect((FORMAT_ROOM_TOKEN[fmt] as string).length).toBeGreaterThan(0);
		}
	});

	it("wire-budget guard: join string for every format token is <= 19 UTF-16 chars", () => {
		for (const fmt of MATCHMAKING_FORMATS) {
			const token = FORMAT_ROOM_TOKEN[fmt] as string;
			const len = maxJoinStringLength(token);
			expect(len).toBeLessThanOrEqual(19);
		}
	});

	it('tcg token is "to"', () => {
		expect(FORMAT_ROOM_TOKEN.tcg).toBe("to");
	});

	it('jtp token is "jtp"', () => {
		expect(FORMAT_ROOM_TOKEN.jtp).toBe("jtp");
	});
});
