/**
 * DisconnectHandler.handleYGOPro() — AI room teardown on human disconnect.
 *
 * When a human player leaves an AI room (room.noHost === true) in ANY phase
 * (WAITING, RPS, CHOOSING_ORDER, SIDE_DECKING, DUELING), the whole room must be
 * finalized so the orphaned bot does not linger as a zombie room.
 *
 * NON-AI rooms (noHost === false) keep the existing WAITING playerLeave behavior.
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

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = (id: string, closed = false) => ({
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
 * Minimal stand-in for a YGOProClient — carries a socket and a destroy spy,
 * and is a real YGOProClient instance so the `instanceof YGOProClient` guard
 * in handleYGOPro() passes.
 */
const makeClient = (socketId: string, closed = false): YGOProClient => {
	const socket = makeSocket(socketId, closed);
	const client = Object.create(YGOProClient.prototype) as YGOProClient;
	Object.defineProperty(client, "socket", { get: () => socket, configurable: true });
	(client as unknown as { destroy: jest.Mock }).destroy = jest.fn();
	return client;
};

const createAIRoom = (
	humanSocketId: string,
	state: DuelState,
	noHost: boolean,
	clients: YGOProClient[],
): YGOProRoom => {
	const room = YGOProRoom.create(
		Math.floor(Math.random() * 100000),
		"AIROOM",
		makeLogger() as never,
		makeEventEmitter(),
		{ name: "Human", password: "", previousMessage: Buffer.alloc(0) } as never,
		humanSocketId,
		makeMessageRepository() as never,
	);
	room.noHost = noHost;
	(room as unknown as { _state: DuelState })._state = state;
	Object.defineProperty(room, "players", { get: () => clients, configurable: true });
	Object.defineProperty(room, "spectators", { get: () => [], configurable: true });
	Object.defineProperty(room, "clients", { get: () => clients, configurable: true });
	MercuryRoomList.addRoom(room);
	return room;
};

const makeRoomFinder = (room: YGOProRoom): RoomFinder =>
	({ run: () => room } as unknown as RoomFinder);

const runDisconnect = (room: YGOProRoom, humanSocketId: string): void => {
	const socket = makeSocket(humanSocketId, true);
	const handler = new DisconnectHandler(socket as never, makeRoomFinder(room));
	handler.run();
};

// ---------- tests ----------

describe("DisconnectHandler.handleYGOPro() — AI room teardown", () => {
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

	describe.each([
		["DUELING", DuelState.DUELING],
		["WAITING", DuelState.WAITING],
		["RPS", DuelState.RPS],
		["SIDE_DECKING", DuelState.SIDE_DECKING],
		["CHOOSING_ORDER", DuelState.CHOOSING_ORDER],
	])("AI room (noHost=true) during %s", (_label, state) => {
		it("finalizes the room when the human disconnects", () => {
			const humanId = "sock-human";
			const human = makeClient(humanId, true);
			const bot = makeClient("sock-bot", false);
			const room = createAIRoom(humanId, state, true, [human, bot]);
			const roomId = room.id;

			runDisconnect(room, humanId);

			expect(room.finalizing).toBe(true);
			expect(MercuryRoomList.findById(roomId)).toBeNull();
			expect(mockInstance.broadcast).toHaveBeenCalledWith(
				expect.objectContaining({ action: "REMOVE-ROOM" }),
			);
			// open bot socket is destroyed
			expect((bot as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalledTimes(1);
		});
	});

	describe("regression — non-AI room (noHost=false)", () => {
		it("uses the existing playerLeave path during WAITING and does NOT destroy the room", () => {
			const humanId = "sock-human";
			const human = makeClient(humanId, true);
			const other = makeClient("sock-other", false);
			const room = createAIRoom(humanId, DuelState.WAITING, false, [human, other]);
			const roomId = room.id;

			const playerLeaveSpy = jest
				.spyOn(room, "playerLeave")
				.mockImplementation(() => undefined);

			runDisconnect(room, humanId);

			// old WAITING path: playerLeave called, player destroyed, room NOT finalized
			expect(playerLeaveSpy).toHaveBeenCalledWith(human);
			expect((human as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalledTimes(1);
			expect(room.finalizing).toBe(false);
			expect(MercuryRoomList.findById(roomId)).not.toBeNull();
			expect(mockInstance.broadcast).not.toHaveBeenCalledWith(
				expect.objectContaining({ action: "REMOVE-ROOM" }),
			);
		});
	});
});
