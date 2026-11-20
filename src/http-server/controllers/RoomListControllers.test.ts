import { Request, Response } from "express";

import { RoomMother } from "@test-support/mothers/room/RoomMother";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import RoomList from "@edopro/room/infrastructure/RoomList";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { GetRoomListController } from "./GetRoomListController";
import { RoomListController } from "./RoomListController";

const MASTER_RULE_5 = 0x2e800;
const RUSH_DUEL = 0x7f28200;

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
		for (const room of [...RoomList.getRooms()]) {
			RoomList.deleteRoom(room);
		}
	});

	it("leaves unlisted rooms out of /api/rooms", () => {
		const response = makeResponse();

		new RoomListController().run({ query: {} } as Request, response as unknown as Response);

		expect(response.json.mock.calls[0][0].rooms).toHaveLength(1);
	});

	it("lists a 1v1 EDOPro room in /api/rooms, for a caller that asks for them, with its join command", () => {
		const duel = RoomMother.create({
			id: 4321,
			team0: 1,
			team1: 1,
			duelFlagsLow: MASTER_RULE_5,
			needPass: true,
			ranked: true,
		});
		RoomList.addRoom(duel);
		RoomList.addRoom(RoomMother.create({ team0: 2, team1: 2 }));
		const response = makeResponse();

		new RoomListController().run(
			{ query: { engines: "ygopro,edopro" } } as unknown as Request,
			response as unknown as Response,
		);

		const edoproRows = response.json.mock.calls[0][0].rooms.filter(
			(room: { engine?: string }) => room.engine === "edopro",
		);
		expect(edoproRows).toHaveLength(1);
		expect(edoproRows[0]).toMatchObject({
			id: 4321,
			command: "edo,4321",
			status: "waiting",
			started: false,
			private: true,
			canPlay: true,
			canWatch: false,
			maxPlayers: 2,
			ranked: true,
			league: "external",
		});
	});

	it("leaves out an EDOPro room a YGOPro client cannot present, such as a Rush Duel", () => {
		RoomList.addRoom(RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: RUSH_DUEL }));
		const response = makeResponse();

		new RoomListController().run(
			{ query: { engines: "ygopro,edopro" } } as unknown as Request,
			response as unknown as Response,
		);

		const edoproRows = response.json.mock.calls[0][0].rooms.filter(
			(room: { engine?: string }) => room.engine === "edopro",
		);
		expect(edoproRows).toHaveLength(0);
	});

	it("leaves EDOPro rooms out of /api/rooms for a caller that does not ask for them", () => {
		RoomList.addRoom(RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: MASTER_RULE_5 }));
		const response = makeResponse();

		new RoomListController().run({ query: {} } as Request, response as unknown as Response);

		const rooms = response.json.mock.calls[0][0].rooms as Array<{ engine?: string }>;
		expect(rooms).toHaveLength(1);
		expect(rooms.some((room) => room.engine === "edopro")).toBe(false);
	});

	it("lists only EDOPro rooms for a caller that asks for that engine alone", () => {
		RoomList.addRoom(RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: MASTER_RULE_5 }));
		const response = makeResponse();

		new RoomListController().run(
			{ query: { engines: "edopro" } } as unknown as Request,
			response as unknown as Response,
		);

		const rooms = response.json.mock.calls[0][0].rooms as Array<{ engine?: string }>;
		expect(rooms.map((room) => room.engine)).toEqual(["edopro"]);
	});

	it("applies the open filter of /api/rooms to EDOPro rooms too", () => {
		RoomList.addRoom(
			RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: MASTER_RULE_5, needPass: true }),
		);
		const response = makeResponse();

		new RoomListController().run(
			{ query: { open: "true", engines: "ygopro,edopro" } } as unknown as Request,
			response as unknown as Response,
		);

		expect(
			response.json.mock.calls[0][0].rooms.some(
				(room: { engine?: string }) => room.engine === "edopro",
			),
		).toBe(false);
	});

	it("leaves unlisted rooms out of /api/getrooms", () => {
		const response = makeResponse();

		new GetRoomListController().run({} as Request, response as unknown as Response);

		expect(response.json.mock.calls[0][0].rooms).toHaveLength(1);
	});
});
