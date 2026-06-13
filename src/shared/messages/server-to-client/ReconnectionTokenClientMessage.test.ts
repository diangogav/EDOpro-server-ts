import { ReconnectionTokenClientMessage } from "./ReconnectionTokenClientMessage";

// Pins the exact STOC wire format of the reconnection token frame:
// [2b size LE][0xfd][token utf8]. The native EDOpro client relies on opcode
// 0xfd, so this byte layout must never drift.
describe("ReconnectionTokenClientMessage", () => {
	it("builds [size LE][0xfd][token] for an ascii token", () => {
		const buffer = ReconnectionTokenClientMessage.create("abc");

		// data = 0xfd + "abc" (3 bytes) => length 4 => size LE = 04 00
		expect(buffer.toString("hex")).toBe("0400fd616263");
	});

	it("encodes the size as the length of opcode + token", () => {
		const token = "a".repeat(32); // 16 random bytes hex-encoded
		const buffer = ReconnectionTokenClientMessage.create(token);

		expect(buffer.readUInt16LE(0)).toBe(token.length + 1);
		expect(buffer.readUInt8(2)).toBe(0xfd);
		expect(buffer.subarray(3).toString("utf8")).toBe(token);
	});
});
