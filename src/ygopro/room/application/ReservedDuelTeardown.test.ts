/**
 * How a reserved room records its end when no game over happened: who left,
 * the lobby timeout, the abandon grace, and the single teardown that writes it.
 */
jest.mock("../../../web-socket-server/WebSocketSingleton", () => ({
	__esModule: true,
	default: { getInstance: () => ({ broadcast: jest.fn() }) },
}));
jest.mock("@shared/dependency-injection", () => ({
	container: { get: () => ({ runClosed: jest.fn() }) },
}));

import { Logger } from "@shared/logger/domain/Logger";
import { Reservation } from "@shared/reserved-duel/domain/Reservation";
import { ReservedDuelSession } from "@shared/reserved-duel/domain/ReservedDuelSession";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoomMother } from "@test-support/mothers/room/YGOProRoomMother";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { YGOProRoom } from "../domain/YGOProRoom";
import YGOProRoomList from "../infrastructure/YGOProRoomList";
import { AbandonBetweenDuels } from "./AbandonBetweenDuels";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";
import { ReservedDuelLobbyTimeout } from "./ReservedDuelLobbyTimeout";
import { YGOProDisconnectPolicy } from "./YGOProDisconnectPolicy";

const ID = "Ab3dEf6hIj9kLm2n";

const makeReservation = (reconnect = false, bot = true): Reservation => ({
	id: ID,
	format: "edison",
	mode: "single",
	participants: [
		{ seat: 0, kind: "user", userId: "user-1", requiredDeck: null },
		bot
			? { seat: 1, kind: "windbot", botName: "Haunted" }
			: { seat: 1, kind: "user", userId: "user-2", requiredDeck: null },
	],
	options: {
		spectators: false,
		listed: false,
		reconnect,
		deckLock: "exact",
		lobbyTimeoutSeconds: 1,
	},
});

const makeRecorder = () => ({ started: jest.fn(), abandoned: jest.fn(), release: jest.fn() });

const makePlayer = (
	team: number,
	{ closed = false, internal = false, ready = false } = {},
): YGOProClient => {
	const socket = { id: `sock-${team}-${Math.random()}`, closed, destroy: jest.fn() };
	const client = Object.create(YGOProClient.prototype) as YGOProClient;
	Object.defineProperty(client, "socket", { get: () => socket, configurable: true });
	Object.defineProperty(client, "team", { get: () => team, configurable: true });
	Object.defineProperty(client, "isInternal", { get: () => internal, configurable: true });
	Object.defineProperty(client, "isReady", { get: () => ready, configurable: true });
	Object.defineProperty(client, "isSpectator", { get: () => false, configurable: true });
	(client as unknown as Record<string, unknown>).destroy = jest.fn();
	return client;
};

const makeRoom = (players: YGOProClient[], reservation = makeReservation()) => {
	const recorder = makeRecorder();
	const room = YGOProRoomMother.create({ command: "edison#secret" });
	room.reservedDuel = new ReservedDuelSession(reservation, recorder);
	room.noReconnect = !reservation.options.reconnect;
	Object.defineProperty(room, "players", { get: () => players, configurable: true });
	Object.defineProperty(room, "clients", { get: () => [], configurable: true });
	YGOProRoomList.addRoom(room);
	return { room, recorder };
};

const logger = new LoggerMock() as Logger;

afterEach(() => {
	jest.restoreAllMocks();
	const rooms = YGOProRoomList.getRooms();
	while (rooms.length) {
		YGOProRoomList.deleteRoom(rooms[0]);
	}
});

describe("FinalizeYGOProRoom with a reserved duel", () => {
	it("records the abandon it is given and releases the reservation", () => {
		const { room, recorder } = makeRoom([]);

		FinalizeYGOProRoom.run(room, { seat: 0, reason: "disconnect" });

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: 0, reason: "disconnect" });
		expect(recorder.release).toHaveBeenCalledWith(ID);
	});

	it("records room_closed when the caller names no cause", () => {
		const { room, recorder } = makeRoom([]);

		FinalizeYGOProRoom.run(room);

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "room_closed" });
	});

	it("writes nothing for a room that dispatched its game over", () => {
		const { room, recorder } = makeRoom([]);
		room.reservedDuel?.markGameOver();

		FinalizeYGOProRoom.run(room, { seat: 0, reason: "disconnect" });

		expect(recorder.abandoned).not.toHaveBeenCalled();
		expect(recorder.release).toHaveBeenCalledWith(ID);
	});
});

describe("YGOProDisconnectPolicy with a reserved duel", () => {
	const policy = new YGOProDisconnectPolicy();

	it("ends a no-reconnect room at once when a human leaves, blaming their seat", () => {
		const human = makePlayer(0, { closed: true });
		const { room, recorder } = makeRoom([human, makePlayer(1, { internal: true })]);

		policy.onDisconnect(room, human.socket as never, logger);

		expect(room.finalizing).toBe(true);
		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: 0, reason: "disconnect" });
	});

	it("blames nobody when the bot drops", () => {
		const bot = makePlayer(1, { closed: true, internal: true });
		const { room, recorder } = makeRoom([makePlayer(0), bot]);

		policy.onDisconnect(room, bot.socket as never, logger);

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "bot_unavailable" });
	});

	it("lets a reconnect room wait for a human while the other human stays", () => {
		const leaver = makePlayer(1, { closed: true });
		const { room, recorder } = makeRoom([makePlayer(0), leaver], makeReservation(true, false));
		jest.spyOn(AbandonBetweenDuels, "playerLeft").mockReturnValue(true);

		policy.onDisconnect(room, leaver.socket as never, logger);

		expect(room.finalizing).toBe(false);
		expect(recorder.abandoned).not.toHaveBeenCalled();
	});

	it("ends a reconnect room when the last human is gone", () => {
		const leaver = makePlayer(1, { closed: true });
		const { room, recorder } = makeRoom(
			[makePlayer(0, { closed: true }), leaver],
			makeReservation(true, false),
		);

		policy.onDisconnect(room, leaver.socket as never, logger);

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: 1, reason: "disconnect" });
	});
});

describe("ReservedDuelLobbyTimeout", () => {
	it("blames the human seat that never showed up", () => {
		const { room, recorder } = makeRoom([makePlayer(1, { internal: true, ready: true })]);

		ReservedDuelLobbyTimeout.expire(room);

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: 0, reason: "no_show" });
	});

	it("blames the bot when every human was there and ready", () => {
		const { room, recorder } = makeRoom([makePlayer(0, { ready: true })]);

		ReservedDuelLobbyTimeout.expire(room);

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: null, reason: "bot_unavailable" });
	});

	it("does nothing once the first duel started", () => {
		const { room, recorder } = makeRoom([]);
		room.reservedDuel?.markStarted("match-1");

		ReservedDuelLobbyTimeout.expire(room);

		expect(room.finalizing).toBe(false);
		expect(recorder.abandoned).not.toHaveBeenCalled();
	});

	it("fires after the reservation's lobby timeout", () => {
		jest.useFakeTimers();
		try {
			const { room, recorder } = makeRoom([]);

			ReservedDuelLobbyTimeout.schedule(room);
			jest.advanceTimersByTime(999);
			expect(recorder.abandoned).not.toHaveBeenCalled();
			jest.advanceTimersByTime(1);

			expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: 0, reason: "no_show" });
		} finally {
			jest.useRealTimers();
		}
	});
});

describe("AbandonBetweenDuels with a reserved duel", () => {
	it("records the leaver's seat when it cancels a match nobody won a duel of", async () => {
		const { room, recorder } = makeRoom(
			[makePlayer(0), makePlayer(1)],
			makeReservation(true, false),
		);
		jest.spyOn(room, "isBetweenDuels").mockReturnValue(true);
		jest.spyOn(room, "isMatchFinished").mockReturnValue(false);
		jest.spyOn(room, "hasPlayedAnyDuel").mockReturnValue(false);
		jest.spyOn(room, "getTeamPlayers").mockReturnValue([]);

		await AbandonBetweenDuels.resolve(room as YGOProRoom, 1, logger);

		expect(recorder.abandoned).toHaveBeenCalledWith(ID, { seat: 1, reason: "disconnect" });
	});
});
