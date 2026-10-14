import { EMOTE_OPCODE, buildStocEmoteFrame } from "./emote-protocol";

describe("buildStocEmoteFrame", () => {
	it("lays out [size LE][0xfc][playerType][id] with size = 2 + id bytes", () => {
		const frame = buildStocEmoteFrame(1, "fire");
		expect(frame.readUInt16LE(0)).toBe(6); // opcode + playerType + 4 id bytes
		expect(frame.readUInt8(2)).toBe(EMOTE_OPCODE);
		expect(frame.readUInt8(3)).toBe(1);
		expect(frame.subarray(4).toString("utf8")).toBe("fire");
	});

	it("relays a Buffer id byte for byte, even when it is not valid utf-8", () => {
		const raw = Buffer.from([0xff, 0xfe, 0x61]);
		const frame = buildStocEmoteFrame(0, raw);
		expect(frame.readUInt16LE(0)).toBe(5);
		expect(frame.subarray(4).equals(raw)).toBe(true);
	});

	it("masks the player type into a byte", () => {
		expect(buildStocEmoteFrame(7, "cry").readUInt8(3)).toBe(7);
	});
});
