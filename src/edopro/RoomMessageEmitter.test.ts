import type { Client } from "@edopro/client/domain/Client";
import type { Room } from "@edopro/room/domain/Room";

import { RoomMessageEmitter } from "./RoomMessageEmitter";

const frame = (command: number): Buffer => Buffer.from([0x01, 0x00, command]);

describe("RoomMessageEmitter", () => {
	it("emits one room event per frame for a chunk with many frames", () => {
		const emitRoomEvent = jest.fn();
		const room = { emitRoomEvent } as unknown as Room;
		const emitter = new RoomMessageEmitter({} as Client, room);
		const frames = 20_000;

		emitter.handleMessage(Buffer.concat(Array.from({ length: frames }, () => frame(0x16))));

		expect(emitRoomEvent).toHaveBeenCalledTimes(frames);
	});
});
