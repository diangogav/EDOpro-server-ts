jest.mock("src/utils/generateUniqueId");

import RoomList from "@edopro/room/infrastructure/RoomList";
import { RoomMother } from "@test-support/mothers/room/RoomMother";
import { generateUniqueId } from "src/utils/generateUniqueId";

import { generateUnusedRoomId } from "./generateUnusedRoomId";

const nextIds = (...ids: number[]) => {
	const mock = generateUniqueId as jest.Mock;
	mock.mockReset();
	ids.forEach((id) => mock.mockReturnValueOnce(id));
};

describe("generateUnusedRoomId", () => {
	afterEach(() => {
		[...RoomList.getRooms()].forEach((room) => RoomList.deleteRoom(room));
	});

	it("skips ids already used by a live EDOPro room", () => {
		RoomList.addRoom(RoomMother.create({ id: 4242 }));
		nextIds(4242, 4243);

		expect(generateUnusedRoomId()).toBe(4243);
	});

	it("returns the first id when no live room uses it", () => {
		nextIds(1234);

		expect(generateUnusedRoomId()).toBe(1234);
	});

	it("fails when every attempt hits a live room", () => {
		RoomList.addRoom(RoomMother.create({ id: 5000 }));
		(generateUniqueId as jest.Mock).mockReset().mockReturnValue(5000);

		expect(() => generateUnusedRoomId()).toThrow("No unused room id found");
	});
});
