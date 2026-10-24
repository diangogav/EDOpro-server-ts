import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import YGOProRoomList from "./YGOProRoomList";
import { YGOProRoomLocator } from "./YGOProRoomLocator";

function makeRoom(
	id: number,
	players: string[],
	options: { spectators?: string[]; createdBy?: string } = {},
): YGOProRoom {
	const client = (socketId: string) => ({ socket: { id: socketId } });

	return {
		id,
		players: players.map(client),
		spectators: (options.spectators ?? []).map(client),
		createdBySocketId: options.createdBy,
	} as unknown as YGOProRoom;
}

describe("YGOProRoomLocator", () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it("finds the room where the socket is a player or a spectator", () => {
		jest
			.spyOn(YGOProRoomList, "getRooms")
			.mockReturnValue([makeRoom(1, ["a"]), makeRoom(2, ["b"], { spectators: ["s"] })]);

		const locator = new YGOProRoomLocator();

		expect(locator.findBySocketId("b")?.id).toBe(2);
		expect(locator.findBySocketId("s")?.id).toBe(2);
	});

	it("falls back to the room created by the socket when it has not joined yet", () => {
		jest.spyOn(YGOProRoomList, "getRooms").mockReturnValue([makeRoom(1, [], { createdBy: "c" })]);

		expect(new YGOProRoomLocator().findBySocketId("c")?.id).toBe(1);
	});

	it("prefers a room where the socket joined over a room it created", () => {
		jest
			.spyOn(YGOProRoomList, "getRooms")
			.mockReturnValue([makeRoom(1, [], { createdBy: "c" }), makeRoom(2, ["c"])]);

		expect(new YGOProRoomLocator().findBySocketId("c")?.id).toBe(2);
	});

	it("returns null when no room holds or was created by the socket", () => {
		jest.spyOn(YGOProRoomList, "getRooms").mockReturnValue([makeRoom(1, ["a"])]);

		expect(new YGOProRoomLocator().findBySocketId("z")).toBeNull();
	});
});
