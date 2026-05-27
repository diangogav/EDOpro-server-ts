/**
 * Canonical room teardown for YGOPro rooms.
 *
 * FinalizeYGOProRoom.run() centralizes the teardown sequence that was previously
 * duplicated between YGOProDuelingState.removeRoom() and
 * DisconnectHandler.handleYGOPro(). Order matters:
 *   1. room.finalizing = true (aborts any in-flight windbot retry loop)
 *   2. WindbotModule.cleanupRoomIfEnabled(room.id) (no-op when windbot off)
 *   3. destroy still-open client sockets (orphaned bot would otherwise hang)
 *   4. MercuryRoomList.deleteRoom(room)
 *   5. broadcast REMOVE-ROOM
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

import { WindbotModule, WindbotModuleDeps } from "../../windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../windbot/domain/WindbotTokenStore";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";
import MercuryRoomList from "../infrastructure/YGOProRoomList";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";

// ---------- helpers ----------

const makeSocket = (closed = true) => ({
	id: `sock-${Math.random()}`,
	closed,
	destroy: jest.fn(),
	send: jest.fn(),
	removeAllListeners: jest.fn(),
});

const makeRepo = () => ({
	findAll: jest.fn().mockReturnValue([]),
	findByName: jest.fn().mockReturnValue(null),
	pickRandom: jest.fn().mockReturnValue(null),
});

const makeProvider = () => ({
	requestJoin: jest.fn().mockResolvedValue(undefined),
});

const makeDeps = (overrides: Partial<WindbotModuleDeps> = {}): WindbotModuleDeps => ({
	enabled: true,
	repo: makeRepo(),
	tokenStore: WindbotTokenStore.createForTests(),
	provider: makeProvider() as unknown as WindbotModuleDeps["provider"],
	...overrides,
});

interface FakeClient {
	socket: ReturnType<typeof makeSocket>;
	destroy: jest.Mock;
}

const makeClient = (socket = makeSocket()): FakeClient => {
	const client: FakeClient = {
		socket,
		destroy: jest.fn(() => socket.destroy()),
	};
	return client;
};

/**
 * Build a real room registered in MercuryRoomList and stub its client list.
 */
const createRoomInList = (clients: FakeClient[] = []) => {
	const room = YGOProRoomMother.create({ command: "AIROOM" });
	Object.defineProperty(room, "clients", { get: () => clients, configurable: true });
	MercuryRoomList.addRoom(room);
	return room;
};

// ---------- tests ----------

describe("FinalizeYGOProRoom.run()", () => {
	const mockInstance = WebSocketSingleton.getInstance();

	beforeEach(() => {
		(mockInstance.broadcast as jest.Mock).mockClear();
	});

	afterEach(() => {
		WindbotModule.resetForTests();
		jest.restoreAllMocks();
		const rooms = MercuryRoomList.getRooms();
		while (rooms.length) {
			MercuryRoomList.deleteRoom(rooms[0]);
		}
	});

	it("sets room.finalizing = true", () => {
		const room = createRoomInList();
		expect(room.finalizing).toBe(false);

		FinalizeYGOProRoom.run(room);

		expect(room.finalizing).toBe(true);
	});

	it("invokes windbot cleanup with the room id", () => {
		WindbotModule.init(makeDeps({ enabled: true }));
		const cleanupSpy = jest.spyOn(WindbotModule, "cleanupRoomIfEnabled");

		const room = createRoomInList();
		FinalizeYGOProRoom.run(room);

		expect(cleanupSpy).toHaveBeenCalledWith(room.id);
	});

	it("destroys an open bot socket", () => {
		const openClient = makeClient(makeSocket(false));
		const room = createRoomInList([openClient]);

		FinalizeYGOProRoom.run(room);

		expect(openClient.destroy).toHaveBeenCalledTimes(1);
	});

	it("does NOT re-destroy an already-closed socket", () => {
		const closedClient = makeClient(makeSocket(true));
		const room = createRoomInList([closedClient]);

		FinalizeYGOProRoom.run(room);

		expect(closedClient.destroy).not.toHaveBeenCalled();
	});

	it("only destroys the open sockets when clients are mixed", () => {
		const openClient = makeClient(makeSocket(false));
		const closedClient = makeClient(makeSocket(true));
		const room = createRoomInList([openClient, closedClient]);

		FinalizeYGOProRoom.run(room);

		expect(openClient.destroy).toHaveBeenCalledTimes(1);
		expect(closedClient.destroy).not.toHaveBeenCalled();
	});

	it("removes the room from MercuryRoomList", () => {
		const room = createRoomInList();
		const roomId = room.id;

		FinalizeYGOProRoom.run(room);

		expect(MercuryRoomList.findById(roomId)).toBeNull();
	});

	it("broadcasts REMOVE-ROOM", () => {
		const room = createRoomInList();

		FinalizeYGOProRoom.run(room);

		expect(mockInstance.broadcast).toHaveBeenCalledWith(
			expect.objectContaining({ action: "REMOVE-ROOM" }),
		);
	});

	it("does not throw when windbot is not initialized", () => {
		const room = createRoomInList();
		expect(() => FinalizeYGOProRoom.run(room)).not.toThrow();
	});
});
