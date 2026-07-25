import { EMOTE_OPCODE, buildStocEmoteFrame, isValidEmoteId } from "./emote-protocol";

describe("isValidEmoteId", () => {
	it("accepts catalog ids", () => {
		expect(isValidEmoteId("wave")).toBe(true);
		expect(isValidEmoteId("mindblown")).toBe(true);
	});

	it("rejects unknown, empty, and over-long ids (no arbitrary-string injection)", () => {
		expect(isValidEmoteId("evil")).toBe(false);
		expect(isValidEmoteId("")).toBe(false);
		expect(isValidEmoteId("x".repeat(25))).toBe(false);
	});
});

describe("buildStocEmoteFrame", () => {
	it("lays out [size LE][0xfc][playerType][id] with size = 2 + id bytes", () => {
		const frame = buildStocEmoteFrame(1, "fire");
		expect(frame.readUInt16LE(0)).toBe(6); // opcode + playerType + 4 id bytes
		expect(frame.readUInt8(2)).toBe(EMOTE_OPCODE);
		expect(frame.readUInt8(3)).toBe(1);
		expect(frame.subarray(4).toString("utf8")).toBe("fire");
	});

	it("masks the player type into a byte", () => {
		expect(buildStocEmoteFrame(7, "cry").readUInt8(3)).toBe(7);
	});
});
