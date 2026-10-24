import { RoomLocator } from "@shared/room/domain/RoomLocator";
import { YgoRoom } from "@shared/room/domain/YgoRoom";

import { RoomFinder } from "./RoomFinder";

function makeRoom(id: number): YgoRoom {
	return { id } as unknown as YgoRoom;
}

function makeLocator(room: YgoRoom | null): jest.Mocked<RoomLocator> {
	return { findBySocketId: jest.fn().mockReturnValue(room) };
}

describe("RoomFinder", () => {
	it("returns the room of the first locator that finds the socket", () => {
		const first = makeLocator(null);
		const second = makeLocator(makeRoom(2));
		const third = makeLocator(makeRoom(3));

		const room = new RoomFinder([first, second, third]).run("sock-1");

		expect(room?.id).toBe(2);
		expect(first.findBySocketId).toHaveBeenCalledWith("sock-1");
		expect(third.findBySocketId).not.toHaveBeenCalled();
	});

	it("returns null when no locator finds the socket", () => {
		expect(new RoomFinder([makeLocator(null), makeLocator(null)]).run("sock-1")).toBeNull();
	});
});
