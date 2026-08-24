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
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { DuelState } from "@shared/room/domain/YgoRoom";
import { YGOProStocDuelEnd } from "ygopro-msg-encode";

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
	reconnectionToken: string | null;
	clearReconnectionToken: jest.Mock;
}

const makeClient = (socket = makeSocket()): FakeClient => {
	const client: FakeClient = {
		socket,
		destroy: jest.fn(() => socket.destroy()),
		reconnectionToken: null,
		clearReconnectionToken: jest.fn(() => {
			client.reconnectionToken = null;
		}),
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
		TokenIndex.getInstance().clear();
	});

	afterEach(() => {
		WindbotModule.resetForTests();
		jest.restoreAllMocks();
		TokenIndex.getInstance().clear();
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

	it("is idempotent when overlapping lifecycle owners finalize the same room", () => {
		const openClient = makeClient(makeSocket(false));
		const room = createRoomInList([openClient]);

		FinalizeYGOProRoom.run(room);
		FinalizeYGOProRoom.run(room);

		expect(openClient.destroy).toHaveBeenCalledTimes(1);
		expect(mockInstance.broadcast).toHaveBeenCalledTimes(1);
	});

	it("does not throw when windbot is not initialized", () => {
		const room = createRoomInList();
		expect(() => FinalizeYGOProRoom.run(room)).not.toThrow();
	});

	it("revokes every client's reconnection token from the global index", () => {
		const client = makeClient(makeSocket(true));
		const room = createRoomInList([client]);
		const token = "deadbeefdeadbeefdeadbeefdeadbeef";
		client.reconnectionToken = token;
		TokenIndex.getInstance().register(token, client as unknown as YgoClient, room.id);

		FinalizeYGOProRoom.run(room);

		expect(TokenIndex.getInstance().find(token)).toBeUndefined();
		expect(client.clearReconnectionToken).toHaveBeenCalled();
	});

	it("leaves tokens belonging to OTHER rooms untouched", () => {
		const client = makeClient(makeSocket(true));
		const room = createRoomInList([client]);
		const otherToken = "cafebabecafebabecafebabecafebabe";
		TokenIndex.getInstance().register(otherToken, makeClient() as unknown as YgoClient, 9999);

		FinalizeYGOProRoom.run(room);

		expect(TokenIndex.getInstance().find(otherToken)).toBeDefined();
	});
});

// ---------- duel-end announcement before socket destroy ----------
//
// A client whose socket is still open mid-duel deliberately tolerates silent
// socket drops (reconnect support), so an unannounced destroy() strands it on
// whatever screen it was showing — the "stuck on Continue" hang in AI rooms,
// where any disconnect finalizes the room in any phase. Once a duel lifecycle
// started, run() must send STOC_DUEL_END to still-open sockets before
// destroying them. The WAITING lobby keeps its silent teardown: join errors
// already speak for themselves there.

describe("FinalizeYGOProRoom.run() — duel-end frame before destroy", () => {
	const DUEL_END_BUFFER = Buffer.from(new YGOProStocDuelEnd().toFullPayload());

	interface AnnouncedClient extends FakeClient {
		sendMessageToClient: jest.Mock;
	}

	const makeAnnouncedClient = (closed: boolean): AnnouncedClient => {
		const client = makeClient(makeSocket(closed)) as AnnouncedClient;
		client.sendMessageToClient = jest.fn();
		return client;
	};

	const createRoomInPhase = (clients: FakeClient[], duelState: DuelState) => {
		const room = createRoomInList(clients);
		Object.defineProperty(room, "duelState", { get: () => duelState, configurable: true });
		return room;
	};

	afterEach(() => {
		const rooms = MercuryRoomList.getRooms();
		while (rooms.length) {
			MercuryRoomList.deleteRoom(rooms[0]);
		}
	});

	it("sends STOC_DUEL_END to a still-connected client before destroying its socket", () => {
		const client = makeAnnouncedClient(false);
		const room = createRoomInPhase([client], DuelState.DUELING);

		FinalizeYGOProRoom.run(room);

		expect(client.sendMessageToClient).toHaveBeenCalledWith(DUEL_END_BUFFER);
		expect(client.destroy).toHaveBeenCalledTimes(1);
		const sendOrder = client.sendMessageToClient.mock.invocationCallOrder[0]!;
		const destroyOrder = client.destroy.mock.invocationCallOrder[0]!;
		expect(sendOrder).toBeLessThan(destroyOrder);
	});

	it("announces in the SIDE_DECKING interlude too", () => {
		const client = makeAnnouncedClient(false);
		const room = createRoomInPhase([client], DuelState.SIDE_DECKING);

		FinalizeYGOProRoom.run(room);

		expect(client.sendMessageToClient).toHaveBeenCalledWith(DUEL_END_BUFFER);
	});

	it("does not touch a client whose socket is already closed", () => {
		const client = makeAnnouncedClient(true);
		const room = createRoomInPhase([client], DuelState.DUELING);

		FinalizeYGOProRoom.run(room);

		expect(client.sendMessageToClient).not.toHaveBeenCalled();
		expect(client.destroy).not.toHaveBeenCalled();
	});

	it("keeps the WAITING lobby teardown silent (join errors already spoke)", () => {
		const client = makeAnnouncedClient(false);
		const room = createRoomInPhase([client], DuelState.WAITING);

		FinalizeYGOProRoom.run(room);

		expect(client.sendMessageToClient).not.toHaveBeenCalled();
		expect(client.destroy).toHaveBeenCalledTimes(1);
	});

	it("still destroys the socket when the duel-end send throws", () => {
		const client = makeAnnouncedClient(false);
		client.sendMessageToClient.mockImplementation(() => {
			throw new Error("broken pipe");
		});
		const room = createRoomInPhase([client], DuelState.DUELING);

		FinalizeYGOProRoom.run(room);

		expect(client.destroy).toHaveBeenCalledTimes(1);
	});
});
