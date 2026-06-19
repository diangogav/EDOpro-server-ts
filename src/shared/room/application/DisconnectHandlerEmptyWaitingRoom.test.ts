/**
 * DisconnectHandler.handleYGOPro() — empty-room teardown (zombie-room fix).
 *
 * Two players leaving a WAITING room used to leave an empty zombie room behind.
 * Cleanup now runs only on `close` (socket already closed), and the single
 * `hasNoConnectedPlayers` guard finalizes the room once nobody is connected.
 */

jest.mock("../../../web-socket-server/WebSocketSingleton", () => {
	const mockBroadcast = jest.fn();
	return {
		__esModule: true,
		default: {
			getInstance: () => ({ broadcast: mockBroadcast }),
		},
		mockBroadcast,
	};
});

import { EventEmitter } from "stream";

import { DisconnectHandler } from "./DisconnectHandler";
import { DuelState } from "../domain/YgoRoom";
import { RoomFinder } from "./RoomFinder";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import MercuryRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";

// ---------- helpers ----------

type MutableSocket = {
	id: string;
	closed: boolean;
	destroy: jest.Mock;
	send: jest.Mock;
	removeAllListeners: jest.Mock;
};

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = (id: string, closed = false): MutableSocket => ({
	id,
	closed,
	destroy: jest.fn(),
	send: jest.fn(),
	removeAllListeners: jest.fn(),
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(4)),
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
});

const makeEventEmitter = () => new EventEmitter();

/**
 * Minimal stand-in for a YGOProClient — a real instance (so the
 * `instanceof YGOProClient` guard passes) carrying a mutable socket so a test
 * can flip `closed` to reproduce a `close` event mid-scenario.
 */
const makeClient = (socketId: string, closed = false): YGOProClient => {
	const socket = makeSocket(socketId, closed);
	const client = Object.create(YGOProClient.prototype) as YGOProClient;
	Object.defineProperty(client, "socket", { get: () => socket, configurable: true });
	(client as unknown as { destroy: jest.Mock }).destroy = jest.fn();
	return client;
};

const socketOf = (client: YGOProClient): MutableSocket => client.socket as unknown as MutableSocket;

/**
 * Creates a WAITING YGOProRoom backed by a mutable `clients` array. The
 * `players`/`clients` getters and `hasNoConnectedPlayers` read that array, and
 * playerLeave() is stubbed to splice from it synchronously (the real
 * removePlayer runs inside an async mutex that would not settle in a sync test).
 */
const createRoom = (id: number, creatorSocketId: string, clients: YGOProClient[]): YGOProRoom => {
	const room = YGOProRoom.create(
		id,
		"ROOM",
		makeLogger() as never,
		makeEventEmitter(),
		{ name: "Host", password: "", previousMessage: Buffer.alloc(0) } as never,
		creatorSocketId,
		makeMessageRepository() as never,
	);
	(room as unknown as { _state: DuelState })._state = DuelState.WAITING;
	Object.defineProperty(room, "players", { get: () => clients, configurable: true });
	Object.defineProperty(room, "spectators", { get: () => [], configurable: true });
	Object.defineProperty(room, "clients", { get: () => clients, configurable: true });
	// `hasNoConnectedPlayers` is left as the real getter — it derives from
	// `players`, which the override above already backs with `clients`.

	jest.spyOn(room, "playerLeave").mockImplementation((player) => {
		const index = clients.findIndex((c) => c.socket.id === player.socket.id);
		if (index !== -1) {
			clients.splice(index, 1);
		}
	});

	MercuryRoomList.addRoom(room);
	return room;
};

const removeRoomBroadcasts = (broadcast: jest.Mock) =>
	broadcast.mock.calls.filter(([arg]) => arg?.action === "REMOVE-ROOM");

const disconnect = (socketId: string, finder: RoomFinder): void => {
	new DisconnectHandler(makeSocket(socketId, true) as never, finder).run();
};

// ---------- tests ----------

describe("DisconnectHandler.handleYGOPro() — empty-room teardown", () => {
	const mockInstance = WebSocketSingleton.getInstance();

	beforeEach(() => {
		(mockInstance.broadcast as jest.Mock).mockClear();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		const rooms = MercuryRoomList.getRooms();
		while (rooms.length) {
			MercuryRoomList.deleteRoom(rooms[0]);
		}
	});

	it("finalizes a WAITING room when the last connected player disconnects", () => {
		const lastId = "sock-last";
		const last = makeClient(lastId, true); // `close` event: socket already closed
		const room = createRoom(91001, lastId, [last]);
		const roomId = room.id;

		disconnect(lastId, { run: () => room } as unknown as RoomFinder);

		expect(room.finalizing).toBe(true);
		expect(MercuryRoomList.findById(roomId)).toBeNull();
		expect(removeRoomBroadcasts(mockInstance.broadcast as jest.Mock)).toHaveLength(1);
	});

	it("keeps the room alive when a player disconnects but another stays connected", () => {
		const leaverId = "sock-leaver";
		const leaver = makeClient(leaverId, true);
		const stayer = makeClient("sock-stayer", false);
		const room = createRoom(91002, leaverId, [leaver, stayer]);
		const roomId = room.id;

		disconnect(leaverId, { run: () => room } as unknown as RoomFinder);

		expect((leaver as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalledTimes(1);
		expect((stayer as unknown as { destroy: jest.Mock }).destroy).not.toHaveBeenCalled();
		expect(room.finalizing).toBe(false);
		expect(MercuryRoomList.findById(roomId)).not.toBeNull();
		expect(removeRoomBroadcasts(mockInstance.broadcast as jest.Mock)).toHaveLength(0);
	});

	it("leaves no zombie room when both players disconnect one after another (real RoomFinder)", () => {
		const creator = makeClient("sock-creator", false);
		const guest = makeClient("sock-guest", false);
		const room = createRoom(91003, "sock-creator", [creator, guest]);
		const roomId = room.id;
		const finder = new RoomFinder();

		// Creator's `close`: its socket is now closed, the guest is still connected.
		socketOf(creator).closed = true;
		disconnect("sock-creator", finder);
		expect(MercuryRoomList.findById(roomId)).not.toBeNull();

		// Guest's `close`: now nobody is connected → the room must be finalized.
		socketOf(guest).closed = true;
		disconnect("sock-guest", finder);

		expect(MercuryRoomList.findById(roomId)).toBeNull();
		expect(removeRoomBroadcasts(mockInstance.broadcast as jest.Mock)).toHaveLength(1);
	});
});
