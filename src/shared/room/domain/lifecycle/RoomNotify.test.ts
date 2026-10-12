import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { YgoClient } from "@shared/client/domain/YgoClient";

import { createRoomNotify } from "./RoomNotify";

function makeClient(id: string | null): jest.Mocked<YgoClient> {
	return {
		id,
		socket: { send: jest.fn() },
	} as unknown as jest.Mocked<YgoClient>;
}

describe("createRoomNotify", () => {
	it("sends the frame only to the clients whose id matches the user", () => {
		const target = makeClient("user-1");
		const other = makeClient("user-2");
		const guest = makeClient(null);
		const room = { clients: [target, other, guest] } as unknown as YgoRoom;
		const frame = Buffer.from([0x01, 0x02]);

		createRoomNotify(room)("user-1", frame);

		expect(target.socket.send).toHaveBeenCalledWith(frame);
		expect(other.socket.send).not.toHaveBeenCalled();
		expect(guest.socket.send).not.toHaveBeenCalled();
	});

	it("reaches every connection of the same user, spectators included", () => {
		const player = makeClient("user-1");
		const spectator = makeClient("user-1");
		const room = { clients: [player, spectator] } as unknown as YgoRoom;
		const frame = Buffer.from([0x09]);

		createRoomNotify(room)("user-1", frame);

		expect(player.socket.send).toHaveBeenCalledWith(frame);
		expect(spectator.socket.send).toHaveBeenCalledWith(frame);
	});

	it("is a silent no-op for an unknown user id", () => {
		const client = makeClient("user-1");
		const room = { clients: [client] } as unknown as YgoRoom;

		expect(() => createRoomNotify(room)("nobody", Buffer.from([0x01]))).not.toThrow();
		expect(client.socket.send).not.toHaveBeenCalled();
	});
});
