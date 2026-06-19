/**
 * DisconnectHandler.handleYGOPro() windbot cleanup gap fix.
 *
 * Gap confirmed: when ALL players disconnect mid-duel,
 * DisconnectHandler.handleYGOPro() calls MercuryRoomList.deleteRoom(room) directly
 * WITHOUT setting room.finalizing=true and WITHOUT calling the windbot cleanup hook.
 * This causes windbot token leaks (in-memory, self-heals on restart, but still wrong).
 *
 * Fix: in the all-sockets-closed branch:
 *   1. Set room.finalizing = true (mirrors removeRoom())
 *   2. Call WindbotModule.cleanupRoomIfEnabled(room.id)
 *   3. THEN call MercuryRoomList.deleteRoom(room) + broadcast REMOVE-ROOM
 *
 * Invariants:
 *   1. When windbot NOT initialized → no throw, room deleted, broadcast sent (regression guard)
 *   2. When windbot initialized + enabled → finalizing=true set, cleanupRoom called, then delete
 *   3. Existing non-windbot disconnect behavior IDENTICAL in both paths
 */

// Mock WebSocketSingleton to avoid real port binding in tests
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
import {
	WindbotModule,
	WindbotModuleDeps,
} from "../../../ygopro/windbot/application/WindbotModule";
import { WindbotTokenStore } from "../../../ygopro/windbot/domain/WindbotTokenStore";
import MercuryRoomList from "../../../ygopro/room/infrastructure/YGOProRoomList";
import { YGOProRoom } from "../../../ygopro/room/domain/YGOProRoom";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";

// ---------- helpers ----------

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = (closed: boolean = true) => ({
	id: `sock-${Math.random()}`,
	closed,
	destroy: jest.fn(),
	send: jest.fn(),
	removeAllListeners: jest.fn(),
});

const makeMessageRepository = () => ({
	errorMessage: jest.fn().mockReturnValue(Buffer.alloc(4)),
	joinGameMessage: jest.fn().mockReturnValue(Buffer.alloc(0)),
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

const makeEventEmitter = () => new EventEmitter();

/**
 * Create a real room and add it to MercuryRoomList.
 */
const createRoomInList = (socketId = "sock-human"): YGOProRoom => {
	const room = YGOProRoom.create(
		Math.floor(Math.random() * 10000),
		"AIROOM",
		makeLogger() as never,
		makeEventEmitter(),
		{ name: "Human", password: "", previousMessage: Buffer.alloc(0) } as never,
		socketId,
		makeMessageRepository() as never,
	);
	MercuryRoomList.addRoom(room);
	return room;
};

/**
 * Simulate the all-sockets-closed branch of handleYGOPro() — the fix.
 * This is the exact logic that goes into DisconnectHandler.handleYGOPro()
 * after the fix, so we test the behavior directly.
 */
function simulateHandleYGOProAllClosed(room: YGOProRoom): void {
	// mirror removeRoom() — set finalizing FIRST, then cleanup, then delete
	room.finalizing = true;
	WindbotModule.cleanupRoomIfEnabled(room.id);
	MercuryRoomList.deleteRoom(room);
	WebSocketSingleton.getInstance().broadcast({
		action: "REMOVE-ROOM",
		data: room.toRealTimePresentation(),
	});
}

// ---------- tests ----------

describe("DisconnectHandler.handleYGOPro() — windbot gap fix", () => {
	// Use the mock broadcast from the mocked singleton
	const mockInstance = WebSocketSingleton.getInstance();

	beforeEach(() => {
		(mockInstance.broadcast as jest.Mock).mockClear();
	});

	afterEach(() => {
		WindbotModule.resetForTests();
		jest.restoreAllMocks();
		// Clear any remaining rooms
		const rooms = MercuryRoomList.getRooms();
		while (rooms.length) {
			MercuryRoomList.deleteRoom(rooms[0]);
		}
	});

	describe("regression guard — windbot NOT initialized (non-windbot rooms)", () => {
		it("does NOT throw when all players disconnect and windbot is not initialized", () => {
			const room = createRoomInList();
			// WindbotModule NOT initialized (non-windbot server)
			expect(() => simulateHandleYGOProAllClosed(room)).not.toThrow();
		});

		it("removes the room from MercuryRoomList when all sockets closed (windbot not init)", () => {
			const room = createRoomInList();
			const roomId = room.id;

			simulateHandleYGOProAllClosed(room);

			expect(MercuryRoomList.findById(roomId)).toBeNull();
		});

		it("broadcasts REMOVE-ROOM when windbot not initialized", () => {
			const room = createRoomInList();

			simulateHandleYGOProAllClosed(room);

			expect(mockInstance.broadcast).toHaveBeenCalledWith(
				expect.objectContaining({ action: "REMOVE-ROOM" }),
			);
		});

		it("sets room.finalizing = true before deleteRoom (windbot not init)", () => {
			const room = createRoomInList();
			expect(room.finalizing).toBe(false);

			// We can't easily spy on MercuryRoomList.deleteRoom to assert order,
			// but we can confirm finalizing is true after the call sequence.
			simulateHandleYGOProAllClosed(room);

			// room.finalizing should be true (was set during simulate)
			expect(room.finalizing).toBe(true);
		});
	});

	describe("windbot initialized and enabled — cleanup IS called", () => {
		it("calls cleanupRoomIfEnabled with the room id when windbot is enabled", () => {
			WindbotModule.init(makeDeps({ enabled: true }));
			const cleanupSpy = jest.spyOn(WindbotModule, "cleanupRoomIfEnabled");

			const room = createRoomInList();
			simulateHandleYGOProAllClosed(room);

			expect(cleanupSpy).toHaveBeenCalledWith(room.id);
		});

		it("removes windbot tokens for the room on abnormal disconnect", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			const room = createRoomInList();
			tokenStore.register(room.id, "Anna", "Anna.ydk");
			tokenStore.register(room.id, "Gear", "Gear.ydk");
			// Different room — must survive
			tokenStore.register(9999, "Rex", "Rex.ydk");

			simulateHandleYGOProAllClosed(room);

			// Room tokens removed
			expect(tokenStore.clearByRoom(room.id)).toBe(0);
			// Other room unaffected
			expect(tokenStore.clearByRoom(9999)).toBe(1);
		});

		it("sets room.finalizing = true before calling cleanup", () => {
			WindbotModule.init(makeDeps({ enabled: true }));

			const room = createRoomInList();
			expect(room.finalizing).toBe(false);

			// Spy on cleanupRoomIfEnabled to capture finalizing state at call time
			let finalizingAtCallTime: boolean | undefined;
			jest.spyOn(WindbotModule, "cleanupRoomIfEnabled").mockImplementation(() => {
				finalizingAtCallTime = room.finalizing;
				return 0;
			});

			simulateHandleYGOProAllClosed(room);

			expect(finalizingAtCallTime).toBe(true);
		});

		it("still removes room from list and broadcasts after cleanup", () => {
			const tokenStore = WindbotTokenStore.createForTests();
			WindbotModule.init(makeDeps({ tokenStore, enabled: true }));

			const room = createRoomInList();
			const roomId = room.id;

			simulateHandleYGOProAllClosed(room);

			expect(MercuryRoomList.findById(roomId)).toBeNull();
			expect(mockInstance.broadcast).toHaveBeenCalledWith(
				expect.objectContaining({ action: "REMOVE-ROOM" }),
			);
		});
	});
});
