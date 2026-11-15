import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { bridgeToEdoproRoom, splitFrames } from "./BridgedSocket";

function frame(command: number, body: number[] = []): Buffer {
	const header = Buffer.alloc(3);
	header.writeUInt16LE(body.length + 1, 0);
	header[2] = command;

	return Buffer.concat([header, Buffer.from(body)]);
}

describe("splitFrames", () => {
	it("splits a buffer that packs several frames", () => {
		const first = frame(0x01, [40, 1]);
		const second = frame(0x16);

		expect(splitFrames(Buffer.concat([first, second]))).toEqual([first, second]);
	});

	it("leaves out a frame cut short", () => {
		expect(splitFrames(frame(0x01, [40, 1]).subarray(0, 4))).toEqual([]);
	});
});

describe("bridgeToEdoproRoom", () => {
	it("is the same connection to everything that identifies a socket", () => {
		const socket = new SocketMock();
		socket.id = "socket-1";
		const bridged = bridgeToEdoproRoom(socket);

		bridged.roomId = 4321;

		expect(bridged.id).toBe("socket-1");
		expect(socket.roomId).toBe(4321);
	});

	it("sends the client a YGOPro frame for each EDOPro frame of the room", () => {
		const socket = new SocketMock();
		const sent = jest.spyOn(socket, "send");
		const newTurn = frame(0x01, [40, 1]);
		// Draw: a 32-bit count and a position per card in EDOPro, an 8-bit count in YGOPro.
		const draw = frame(0x01, [90, 0, 1, 0, 0, 0, 0x2e, 0x1a, 0x4d, 0x00, 0x0a, 0, 0, 0]);

		bridgeToEdoproRoom(socket).send(Buffer.concat([newTurn, draw]));

		expect(sent).toHaveBeenNthCalledWith(1, newTurn);
		expect(sent).toHaveBeenNthCalledWith(2, frame(0x01, [90, 0, 1, 0x2e, 0x1a, 0x4d, 0x00]));
	});

	it("tells the player once about a core message it cannot show", () => {
		const socket = new SocketMock();
		const sent = jest.spyOn(socket, "send");
		const bridged = bridgeToEdoproRoom(socket);

		bridged.send(frame(0x01, [161]));
		bridged.send(frame(0x01, [161]));

		expect(sent).toHaveBeenCalledTimes(1);
		expect(sent.mock.calls[0][0][2]).toBe(0x19);
	});
});
