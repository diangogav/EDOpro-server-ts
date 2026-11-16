jest.mock("src/web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));

import RoomList from "@edopro/room/infrastructure/RoomList";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { ISocket } from "@shared/socket/domain/ISocket";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { ClientMother } from "@test-support/mothers/client/ClientMother";
import { RoomMother } from "@test-support/mothers/room/RoomMother";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

import { ygoproReconnectRoute } from "./YGOProReconnectRoute";

const MASTER_RULE_1 = 0xd0700;

function ygoproPlayer(): { client: YgoClient; roomId: number } {
	const room = YGOProRoomMother.create();
	YGOProRoomList.addRoom(room);
	const client = new YGOProClient({
		name: "Yugi",
		socket: new SocketMock(),
		logger: new LoggerMock(),
		position: 0,
		room,
		host: true,
		id: null,
		team: 0,
	});

	return { client, roomId: room.id };
}

function edoproPlayer(bridged: boolean): YgoClient {
	const socket: ISocket = new SocketMock();
	if (bridged) {
		socket.bridgedFromYgopro = true;
	}

	return ClientMother.create({ socket });
}

describe("ygoproReconnectRoute", () => {
	afterEach(() => {
		for (const room of [...RoomList.getRooms()]) {
			RoomList.deleteRoom(room);
		}
	});

	it("takes back a player of a YGOPro room and leads it to that room", () => {
		const { client, roomId } = ygoproPlayer();

		expect(ygoproReconnectRoute.owns(client)).toBe(true);
		expect(ygoproReconnectRoute.roomOf(roomId, client)?.id).toBe(roomId);
	});

	it("takes back a player of an EDOPro room who joined it from this server", () => {
		const room = RoomMother.create({ id: 4321, team0: 1, team1: 1 });
		RoomList.addRoom(room);
		const client = edoproPlayer(true);

		expect(ygoproReconnectRoute.owns(client)).toBe(true);
		expect(ygoproReconnectRoute.roomOf(4321, client)).toBe(room);
	});

	it("leaves a player who joined an EDOPro room from EDOPro to the EDOPro server", () => {
		expect(ygoproReconnectRoute.owns(edoproPlayer(false))).toBe(false);
	});

	it("does not look for the room of a bridged player among the YGOPro rooms", () => {
		const { roomId } = ygoproPlayer();

		expect(ygoproReconnectRoute.roomOf(roomId, edoproPlayer(true))).toBeUndefined();
	});

	it("hands a YGOPro room the reopened socket as it is", () => {
		const reopened: ISocket = new SocketMock();

		expect(ygoproReconnectRoute.socketFor(YGOProRoomMother.create(), reopened)).toBe(reopened);
		expect(reopened.bridgedFromYgopro).toBeUndefined();
	});

	it("hands an EDOPro room a socket that translates its wire, marked as bridged", () => {
		const reopened: ISocket = new SocketMock();
		const room = RoomMother.create({ team0: 1, team1: 1, duelFlagsLow: MASTER_RULE_1 });

		const handed = ygoproReconnectRoute.socketFor(room, reopened);

		expect(handed).not.toBe(reopened);
		expect(reopened.bridgedFromYgopro).toBe(true);
	});
});
