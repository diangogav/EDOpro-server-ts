import { Commands } from "@shared/messages/Commands";

import { frameForLog } from "./frameForLog";

const frame = (command: number, body: Buffer): Buffer => {
	const size = Buffer.alloc(2);
	size.writeUInt16LE(body.length + 1);
	return Buffer.concat([size, Buffer.from([command]), body]);
};

describe("frameForLog", () => {
	it("returns the hex dump of ordinary frames", () => {
		const data = frame(Commands.PING, Buffer.from([1, 2]));

		expect(frameForLog(data)).toBe(data.toString("hex"));
	});

	it.each([
		Commands.RECONNECT,
		Commands.MATCHMAKING_AUTH,
	])("hides the payload of secret-carrying command 0x%s", (command) => {
		const secret = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
		const data = frame(command, secret);

		const logged = frameForLog(data);

		expect(logged).not.toContain(secret.toString("hex"));
		expect(logged).toContain(`len=${data.length}`);
	});

	it("redacts a secret frame that follows another frame in the same chunk", () => {
		const secret = Buffer.from("0123456789abcdef0123456789abcdef", "utf8");
		const ping = frame(Commands.PING, Buffer.from([1, 2]));
		const data = Buffer.concat([ping, frame(Commands.RECONNECT, secret)]);

		const logged = frameForLog(data);

		expect(logged).not.toContain(secret.toString("hex"));
		expect(logged).toContain(ping.toString("hex"));
		expect(logged).toContain(`<redacted 0xfd len=${data.length - ping.length}>`);
	});

	it("hides a trailing partial frame instead of dumping it", () => {
		const ping = frame(Commands.PING, Buffer.from([1, 2]));
		const partial = frame(Commands.RECONNECT, Buffer.from("0123456789abcdef", "utf8")).subarray(
			0,
			9,
		);

		const logged = frameForLog(Buffer.concat([ping, partial]));

		expect(logged).toContain(ping.toString("hex"));
		expect(logged).toContain("<partial len=9>");
		expect(logged).not.toContain(partial.toString("hex"));
	});

	it("tolerates frames shorter than a header", () => {
		expect(frameForLog(Buffer.from([1]))).toBe("<partial len=1>");
	});
});
