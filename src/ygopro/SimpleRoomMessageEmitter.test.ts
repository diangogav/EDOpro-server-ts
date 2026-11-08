import type { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import type { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { SimpleRoomMessageEmitter } from "./SimpleRoomMessageEmitter";

const frame = (command: number): Buffer => Buffer.from([0x01, 0x00, command]);

describe("SimpleRoomMessageEmitter", () => {
	it("emits one room event per frame for a chunk with many frames", () => {
		const emitRoomEvent = jest.fn();
		const room = { emitRoomEvent } as unknown as YGOProRoom;
		const emitter = new SimpleRoomMessageEmitter({} as YGOProClient, room);
		const frames = 20_000;

		emitter.handleMessage(Buffer.concat(Array.from({ length: frames }, () => frame(0x16))));

		expect(emitRoomEvent).toHaveBeenCalledTimes(frames);
	});
});
