import { Room } from "@edopro/room/domain/Room";

import { EdoproRoomLocator } from "./EdoproRoomLocator";
import RoomList from "./RoomList";

function makeRoom(id: number, players: string[], spectators: string[] = []): Room {
	const client = (socketId: string) => ({ socket: { id: socketId } });

	return {
		id,
		players: players.map(client),
		spectators: spectators.map(client),
	} as unknown as Room;
}

describe("EdoproRoomLocator", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("finds the room where the socket is a player", () => {
		jest.spyOn(RoomList, "getRooms").mockReturnValue([makeRoom(1, ["a"]), makeRoom(2, ["b"])]);

		expect(new EdoproRoomLocator().findBySocketId("b")?.id).toBe(2);
	});

	it("finds the room where the socket is a spectator", () => {
		jest.spyOn(RoomList, "getRooms").mockReturnValue([makeRoom(1, ["a"], ["s"])]);

		expect(new EdoproRoomLocator().findBySocketId("s")?.id).toBe(1);
	});

	it("returns null when no room holds the socket", () => {
		jest.spyOn(RoomList, "getRooms").mockReturnValue([makeRoom(1, ["a"])]);

		expect(new EdoproRoomLocator().findBySocketId("z")).toBeNull();
	});
});
