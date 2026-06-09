import { DeckErrorType } from "ygopro-msg-encode";

import { encodeDeckErrorCode } from "./encodeDeckErrorCode";

// Decode exactly the way the client (and ygopro-msg-encode contract) does:
// DeckErrorType lives in the high 4 bits, the offending card id in the low 28.
const decodeType = (code: number): number => (code >>> 28) & 0xf;
const decodeCardId = (code: number): number => code & 0x0fffffff;

describe("encodeDeckErrorCode", () => {
	it.each([
		DeckErrorType.LFLIST, // 1
		DeckErrorType.OCGONLY, // 2
		DeckErrorType.TCGONLY, // 3
		DeckErrorType.UNKNOWNCARD, // 4
		DeckErrorType.CARDCOUNT, // 5
		DeckErrorType.MAINCOUNT, // 6
		DeckErrorType.EXTRACOUNT, // 7
		DeckErrorType.SIDECOUNT, // 8
	])("packs type %i into the high 4 bits (cardId 0)", (type) => {
		const code = encodeDeckErrorCode(type, 0);
		expect(decodeType(code)).toBe(type);
		expect(decodeCardId(code)).toBe(0);
	});

	it("packs both the type and a real offending card id", () => {
		const cardId = 12345678; // fits in 28 bits
		const code = encodeDeckErrorCode(DeckErrorType.LFLIST, cardId);
		expect(decodeType(code)).toBe(DeckErrorType.LFLIST);
		expect(decodeCardId(code)).toBe(cardId);
	});

	it("stays an unsigned 32-bit int when bit 31 is set (type=8 SIDECOUNT)", () => {
		const code = encodeDeckErrorCode(DeckErrorType.SIDECOUNT, 999);
		expect(code).toBeGreaterThan(0); // NOT a negative int32
		expect(Number.isInteger(code)).toBe(true);
		expect(decodeType(code)).toBe(DeckErrorType.SIDECOUNT);
		expect(decodeCardId(code)).toBe(999);
	});

	it("masks a card id that overflows 28 bits without corrupting the type", () => {
		const code = encodeDeckErrorCode(DeckErrorType.MAINCOUNT, 0xffffffff);
		expect(decodeType(code)).toBe(DeckErrorType.MAINCOUNT);
		expect(decodeCardId(code)).toBe(0x0fffffff);
	});
});
