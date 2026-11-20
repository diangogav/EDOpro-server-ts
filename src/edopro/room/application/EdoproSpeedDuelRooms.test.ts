import { EdoproBanList } from "@edopro/ban-list/domain/BanList";
import BanListMemoryRepository from "@edopro/ban-list/infrastructure/BanListMemoryRepository";
import { Room } from "@edopro/room/domain/Room";
import RoomList from "@edopro/room/infrastructure/RoomList";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ForeignRoomEntry } from "@shared/room/application/ForeignRoomEntry";
import { ForeignSpeedDuelEntryRequest } from "@shared/room/application/ForeignSpeedDuelRooms";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { RoomMother } from "@test-support/mothers/room/RoomMother";

import { EdoproSpeedDuelRooms } from "./EdoproSpeedDuelRooms";

const SPEED_DUEL_FLAGS = 0x628000;

function speedDuelList(): EdoproBanList {
	const list = new EdoproBanList();
	list.setName("2025.07 Speed Duel");
	list.whileListed();
	list.add(86198326, 3);

	return list;
}

function request(
	overrides: Partial<ForeignSpeedDuelEntryRequest> = {},
): ForeignSpeedDuelEntryRequest {
	return {
		name: "speed,casual",
		password: "",
		bestOf: 1,
		message: { data: Buffer.alloc(48), previousMessage: Buffer.alloc(40) } as ClientMessage,
		socket: new SocketMock(),
		...overrides,
	};
}

function seat(room: Room, players: number): void {
	Object.defineProperty(room, "players", { get: () => new Array(players).fill({}) });
}

describe("EdoproSpeedDuelRooms", () => {
	let entry: jest.Mocked<ForeignRoomEntry>;
	let rooms: EdoproSpeedDuelRooms;

	beforeEach(() => {
		BanListMemoryRepository.replaceAll([speedDuelList()]);
		entry = { enter: jest.fn().mockReturnValue("joined") };
		rooms = new EdoproSpeedDuelRooms(new LoggerMock(), entry);
	});

	afterEach(() => {
		RoomList.getRooms().length = 0;
		BanListMemoryRepository.replaceAll([]);
	});

	it("opens a waiting Speed Duel room for the first request and lists it", () => {
		expect(rooms.enter(request())).toBe("joined");

		const [room] = RoomList.getRooms();
		expect(RoomList.getRooms()).toHaveLength(1);
		expect(room.duelState).toBe(DuelState.WAITING);
		expect(room.name).toBe("speed,casual");
		expect(room.password).toBe("");
		expect(room.duelFlagsLow).toBe(SPEED_DUEL_FLAGS);
		expect(room.duelFlagsHight).toBe(0);
		expect(room.forbiddenTypes).toBe(0);
		expect(room.extraRules).toBe(0);
		expect(room.startLp).toBe(4000);
		expect(room.startHand).toBe(4);
		expect(room.drawCount).toBe(1);
		expect(room.timeLimit).toBe(450);
		expect(room.deckRules).toMatchObject({
			mainMin: 20,
			mainMax: 30,
			extraMin: 0,
			extraMax: 6,
			sideMin: 0,
			sideMax: 6,
			rule: 4,
		});
		expect(room.noCheck).toBe(false);
		expect(room.noShuffle).toBe(false);
		expect(room.team0).toBe(1);
		expect(room.team1).toBe(1);
		expect(room.bestOf).toBe(1);
		expect(room.banListHash).toBe(speedDuelList().hash);
		expect(room.banListHash).not.toBe(0);
		expect(room.ranked).toBe(false);
		expect(room.createdByServer).toBe(true);
		expect(room.seatsYgoproClients).toBe(true);
	});

	it("hands the joiner to the room it opened, by id and password", () => {
		const joiner = request({ password: "secret" });

		rooms.enter(joiner);

		expect(entry.enter).toHaveBeenCalledWith({
			roomId: RoomList.getRooms()[0].id,
			password: "secret",
			message: joiner.message,
			socket: joiner.socket,
		});
	});

	it("seats a second request with the same name and password in the same room", () => {
		rooms.enter(request());
		rooms.enter(request());

		expect(RoomList.getRooms()).toHaveLength(1);
		expect(entry.enter.mock.calls[1][0].roomId).toBe(RoomList.getRooms()[0].id);
	});

	it.each([
		["name", { name: "m,speed,casual" }],
		["password", { password: "other" }],
	])("opens another room for a different %s", (_field, overrides) => {
		rooms.enter(request());
		rooms.enter(request(overrides));

		expect(RoomList.getRooms()).toHaveLength(2);
		expect(entry.enter.mock.calls[1][0].roomId).toBe(RoomList.getRooms()[1].id);
	});

	it("plays a best of 3 when the request asks for a match", () => {
		rooms.enter(request({ bestOf: 3 }));

		expect(RoomList.getRooms()[0].bestOf).toBe(3);
	});

	it("opens another room when the one of that name is full", () => {
		rooms.enter(request());
		seat(RoomList.getRooms()[0], 2);

		rooms.enter(request());

		expect(RoomList.getRooms()).toHaveLength(2);
		expect(entry.enter.mock.calls[1][0].roomId).toBe(RoomList.getRooms()[1].id);
	});

	it("opens another room when the one of that name is already duelling", () => {
		rooms.enter(request());
		Object.defineProperty(RoomList.getRooms()[0], "duelState", { get: () => DuelState.DUELING });

		rooms.enter(request());

		expect(RoomList.getRooms()).toHaveLength(2);
	});

	it("does not seat anyone in a room of that name hosted by an EDOPro client", () => {
		const hosted = RoomMother.create({
			name: "speed,casual",
			password: "",
			team0: 1,
			team1: 1,
			duelFlagsLow: SPEED_DUEL_FLAGS,
		});
		RoomList.addRoom(hosted);

		rooms.enter(request());

		expect(RoomList.getRooms()).toHaveLength(2);
		expect(entry.enter.mock.calls[0][0].roomId).not.toBe(hosted.id);
	});

	it("opens no room when the Speed Duel ban list is not loaded", () => {
		BanListMemoryRepository.replaceAll([]);

		expect(rooms.enter(request())).toBe("unavailable");
		expect(RoomList.getRooms()).toHaveLength(0);
		expect(entry.enter).not.toHaveBeenCalled();
	});

	it("answers what the entry into the room answers", () => {
		entry.enter.mockReturnValue("not-found");

		expect(rooms.enter(request())).toBe("not-found");
	});
});
