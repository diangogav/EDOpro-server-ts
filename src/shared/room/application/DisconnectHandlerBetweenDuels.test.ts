/**
 * DisconnectHandler.handleYGOPro() — a human-vs-human player leaving between
 * duels hands the decision to AbandonBetweenDuels instead of falling through.
 */

jest.mock("../../../web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));

jest.mock("@ygopro/room/application/AbandonBetweenDuels", () => ({
	AbandonBetweenDuels: { playerLeft: jest.fn().mockReturnValue(true) },
}));

import { EventEmitter } from "stream";

import { AbandonBetweenDuels } from "@ygopro/room/application/AbandonBetweenDuels";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { DuelState } from "../domain/YgoRoom";
import { DisconnectHandler } from "./DisconnectHandler";
import { RoomFinder } from "./RoomFinder";

const makeLogger = () => ({
	child: jest.fn().mockReturnThis(),
	info: jest.fn(),
	warn: jest.fn(),
	error: jest.fn(),
	debug: jest.fn(),
});

const makeSocket = (id: string, closed: boolean) => ({
	id,
	closed,
	destroy: jest.fn(),
	send: jest.fn(),
	removeAllListeners: jest.fn(),
});

const makeClient = (socketId: string, closed: boolean): YGOProClient => {
	const socket = makeSocket(socketId, closed);
	const client = Object.create(YGOProClient.prototype) as YGOProClient;
	Object.defineProperty(client, "socket", { get: () => socket, configurable: true });
	(client as unknown as { destroy: jest.Mock }).destroy = jest.fn();

	return client;
};

const createRoom = (state: DuelState, clients: YGOProClient[]): YGOProRoom => {
	const room = YGOProRoom.create(
		4242,
		"ROOM",
		makeLogger() as never,
		new EventEmitter(),
		{ name: "Leaver", password: "", previousMessage: Buffer.alloc(0) } as never,
		"sock-leaver",
		{ errorMessage: jest.fn(), joinGameMessage: jest.fn() } as never,
	);
	(room as unknown as { _state: DuelState })._state = state;
	Object.defineProperty(room, "players", { get: () => clients, configurable: true });
	Object.defineProperty(room, "spectators", { get: () => [], configurable: true });
	Object.defineProperty(room, "clients", { get: () => clients, configurable: true });

	return room;
};

const runDisconnect = (room: YGOProRoom): void => {
	const finder = { run: () => room } as unknown as RoomFinder;
	new DisconnectHandler(makeSocket("sock-leaver", true) as never, finder).run();
};

describe("DisconnectHandler.handleYGOPro() — leaving between duels", () => {
	beforeEach(() => jest.clearAllMocks());

	it.each([
		DuelState.RPS,
		DuelState.CHOOSING_ORDER,
		DuelState.SIDE_DECKING,
	])("starts the abandon grace window for a leave during %s", (state) => {
		const leaver = makeClient("sock-leaver", true);
		const stayer = makeClient("sock-stayer", false);
		const room = createRoom(state, [leaver, stayer]);

		runDisconnect(room);

		expect(AbandonBetweenDuels.playerLeft).toHaveBeenCalledWith(room, leaver, expect.anything());
		expect(room.finalizing).toBe(false);
	});

	it("finalizes instead when nobody is left connected", () => {
		const leaver = makeClient("sock-leaver", true);
		const other = makeClient("sock-other", true);
		const room = createRoom(DuelState.RPS, [leaver, other]);

		runDisconnect(room);

		expect(AbandonBetweenDuels.playerLeft).not.toHaveBeenCalled();
		expect(room.finalizing).toBe(true);
	});
});
