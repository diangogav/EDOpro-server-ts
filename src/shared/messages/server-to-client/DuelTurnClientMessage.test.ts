import { DuelTurnClientMessage } from "./DuelTurnClientMessage";

// Pins the wire format: [2b size LE][0xee][turn u16 LE].
describe("DuelTurnClientMessage", () => {
	it("builds the frame for turn 7 [03 00 ee 07 00]", () => {
		expect(DuelTurnClientMessage.create(7).toString("hex")).toBe("0300ee0700");
	});

	it("writes a turn above 255 in little endian", () => {
		expect(DuelTurnClientMessage.create(300).toString("hex")).toBe("0300ee2c01");
	});

	it("caps a turn the two bytes cannot hold", () => {
		expect(DuelTurnClientMessage.create(70000).toString("hex")).toBe("0300eeffff");
	});
});
