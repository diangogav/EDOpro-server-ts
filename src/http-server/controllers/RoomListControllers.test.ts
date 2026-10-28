import { Request, Response } from "express";

import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { GetRoomListController } from "./GetRoomListController";
import { RoomListController } from "./RoomListController";

jest.mock("@ygopro/SimpleRoomMessageEmitter");

const makeResponse = () => {
	const response = { status: jest.fn(), json: jest.fn() };
	response.status.mockReturnValue(response);

	return response;
};

describe("room list controllers", () => {
	beforeEach(() => {
		const unlisted = YGOProRoomMother.create({ command: "edison#hidden" });
		Object.defineProperty(unlisted, "isListed", { get: () => false });
		YGOProRoomList.addRoom(YGOProRoomMother.create({ command: "edison#shown" }));
		YGOProRoomList.addRoom(unlisted);
	});

	afterEach(() => {
		const rooms = YGOProRoomList.getRooms();
		while (rooms.length) {
			YGOProRoomList.deleteRoom(rooms[0]);
		}
	});

	it("leaves unlisted rooms out of /api/rooms", () => {
		const response = makeResponse();

		new RoomListController().run({ query: {} } as Request, response as unknown as Response);

		expect(response.json.mock.calls[0][0].rooms).toHaveLength(1);
	});

	it("leaves unlisted rooms out of /api/getrooms", () => {
		const response = makeResponse();

		new GetRoomListController().run({} as Request, response as unknown as Response);

		expect(response.json.mock.calls[0][0].rooms).toHaveLength(1);
	});
});
