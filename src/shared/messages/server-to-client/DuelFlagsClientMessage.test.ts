import { DuelFlagsClientMessage } from "./DuelFlagsClientMessage";

// Pins the wire format: [2b size LE][0xed][low u32 LE][high u32 LE].
describe("DuelFlagsClientMessage", () => {
	it("builds the frame for a Master Rule 5 relay duel [09 00 ed 80 e8 02 00 00 00 00 00]", () => {
		expect(DuelFlagsClientMessage.create(0x2e880, 0).toString("hex")).toBe(
			"0900ed80e8020000000000",
		);
	});

	it("writes the high flags after the low ones", () => {
		expect(DuelFlagsClientMessage.create(0, 0x1).toString("hex")).toBe("0900ed0000000001000000");
	});
});
