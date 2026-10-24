import { Room } from "@edopro/room/domain/Room";
import RoomList from "@edopro/room/infrastructure/RoomList";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { createRoomFinder } from "./roomFinder";

describe("createRoomFinder", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("searches EDOPro rooms before the YGOPro creator fallback", () => {
		const edoproRoom = { id: 1, players: [{ socket: { id: "c" } }], spectators: [] };
		const ygoproRoom = { id: 2, players: [], spectators: [], createdBySocketId: "c" };
		jest.spyOn(RoomList, "getRooms").mockReturnValue([edoproRoom as unknown as Room]);
		jest.spyOn(YGOProRoomList, "getRooms").mockReturnValue([ygoproRoom as unknown as YGOProRoom]);

		expect(createRoomFinder().run("c")?.id).toBe(1);
	});

	it("finds a YGOPro room when no EDOPro room holds the socket", () => {
		const ygoproRoom = { id: 2, players: [{ socket: { id: "y" } }], spectators: [] };
		jest.spyOn(RoomList, "getRooms").mockReturnValue([]);
		jest.spyOn(YGOProRoomList, "getRooms").mockReturnValue([ygoproRoom as unknown as YGOProRoom]);

		expect(createRoomFinder().run("y")?.id).toBe(2);
	});
});
