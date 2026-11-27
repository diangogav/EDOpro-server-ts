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

import { DuelState } from "@shared/room/domain/YgoRoom";

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

	describe("resumeInfoOf", () => {
		it("gives the score from the resuming player's side, the room's ban list, and a YGOPro room", () => {
			const room = YGOProRoomMother.create();
			jest.spyOn(room, "matchScore").mockReturnValue({ team0: 2, team1: 1 });
			const client = { team: 1 } as unknown as YgoClient;

			const info = ygoproReconnectRoute.resumeInfoOf({ client, room });

			expect(info).toEqual({
				banListName: room.banListName,
				score: { own: 1, opponent: 2 },
				edoproRoom: false,
				deck: null,
			});
		});

		it("gives the seat's deck while the room is side decking, and none during a duel", () => {
			const room = YGOProRoomMother.create();
			const card = (code: number) => ({ code: String(code) });
			const client = {
				team: 0,
				deck: { main: [card(1), card(2)], extra: [card(3)], side: [card(4)] },
			} as unknown as YgoClient;
			const state = jest.spyOn(room, "duelState", "get");

			state.mockReturnValue(DuelState.SIDE_DECKING);
			expect(ygoproReconnectRoute.resumeInfoOf({ client, room }).deck).toEqual({
				main: [1, 2],
				extra: [3],
				side: [4],
			});

			state.mockReturnValue(DuelState.DUELING);
			expect(ygoproReconnectRoute.resumeInfoOf({ client, room }).deck).toBeNull();
		});

		it("marks an EDOPro room and gives its ban list", () => {
			const room = RoomMother.create();
			const client = { team: 0 } as unknown as YgoClient;

			const info = ygoproReconnectRoute.resumeInfoOf({ client, room });

			expect(info.edoproRoom).toBe(true);
			expect(info.banListName).toBe(room.banListName);
		});
	});

	describe("seatOf", () => {
		function seatedEdoproPlayer(bridged: boolean, userId: string) {
			const room = RoomMother.create();
			jest.spyOn(room, "duelState", "get").mockReturnValue(DuelState.DUELING);
			const client = edoproPlayer(bridged);
			client.setCredential({ kind: "verified", userId });
			client.setReconnectionToken("tok");
			room.players.push(client);
			RoomList.addRoom(room);

			return { room, client };
		}

		it("finds the account's seat in an EDOPro room it entered from this server", () => {
			const { room, client } = seatedEdoproPlayer(true, "user-1");

			expect(ygoproReconnectRoute.seatOf("user-1")).toEqual({ client, room });
			expect(ygoproReconnectRoute.resumeInfoOf({ client, room }).edoproRoom).toBe(true);
		});

		it("leaves a seat of an EDOPro room joined from EDOPro to the EDOPro server", () => {
			seatedEdoproPlayer(false, "user-2");

			expect(ygoproReconnectRoute.seatOf("user-2")).toBeNull();
		});
	});
});
