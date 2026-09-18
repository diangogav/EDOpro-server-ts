import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";
import { mercuryConfig } from "@ygopro/config";

import { MatchmakingPool } from "../domain/MatchmakingPool";
import { Session } from "../domain/Session";
import { SocketParticipantChannel } from "../infrastructure/SocketParticipantChannel";
import { MATCHMAKING_FOUND } from "../protocol/matchmaking-protocol";
import { AuthenticateMatchmakingSession } from "./AuthenticateMatchmakingSession";
import { CancelMatchmaking } from "./CancelMatchmaking";
import { EnterMatchmaking } from "./EnterMatchmaking";
import { MatchmakingConnectionHandler } from "./MatchmakingConnectionHandler";
import { createMatchmakingRoom } from "./MatchmakingRoomFactory";
import { MatchmakingQueue } from "./MatchmakingQueue";
import { ProvisionMatchRoom } from "./ProvisionMatchRoom";

jest.mock("./MatchmakingRoomFactory", () => ({ createMatchmakingRoom: jest.fn() }));
const createMatchmakingRoomMock = createMatchmakingRoom as jest.Mock;
const logger: Logger = new LoggerMock();
const noBans = { isBanned: jest.fn().mockResolvedValue(false) };
const noNames = { resolve: jest.fn().mockResolvedValue(null) };
const fakeTickets = (map: Record<string, string>): TicketRepository => ({
	consume: jest.fn(async (ticket: string) => map[ticket] ?? null),
});
const emit = (eventEmitter: EventEmitter, command: Commands, data: Buffer): boolean =>
	eventEmitter.emit(command as unknown as string, { data });
const authBody = (ticket: string): Buffer => {
	const bytes = Buffer.from(ticket, "utf8");
	return Buffer.concat([Buffer.from([bytes.length]), bytes]);
};
const enterBody = (): Buffer => {
	const body = Buffer.alloc(4);
	body.writeUInt16LE(mercuryConfig.version, 2);
	return body;
};
const receivedFound = (send: jest.SpyInstance): boolean =>
	send.mock.calls.some((call) => (call[0] as Buffer).readUInt8(2) === MATCHMAKING_FOUND);
/** Flushes every pending microtask so a fire-and-forget async AUTH settles. */
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Wires the exact real production collaborators the socket transport uses,
 * without a live TCP socket. */
function connectSocket(pool: MatchmakingPool, tickets: TicketRepository) {
	const socket = new SocketMock();
	const eventEmitter = new EventEmitter();
	const authenticate = new AuthenticateMatchmakingSession(tickets, noBans, noNames, logger);
	new MatchmakingConnectionHandler(
		eventEmitter,
		socket,
		new Session(socket),
		new SocketParticipantChannel(socket),
		authenticate,
		new EnterMatchmaking(pool, () => Date.now(), logger),
		new CancelMatchmaking(pool, logger),
		logger,
	);
	return { socket, eventEmitter };
}

/** Boots the exact production seam (`ProvisionMatchRoom` as the facade's
 * `matchHandler`), with a mocked room factory as the only fake room port. */
function initQueue(): MatchmakingPool {
	createMatchmakingRoomMock.mockReturnValue({
		room: { id: 555, emit: jest.fn() },
		roomPassword: "tt,mm555#pw123456",
	});
	MatchmakingQueue.init({
		now: () => Date.now(),
		createRankedRoom: jest.fn(),
		createBotRoom: jest.fn(),
		spawnBot: jest.fn(),
		matchHandler: new ProvisionMatchRoom({
			logger,
			roomIdGenerator: { next: () => 555 },
			pool: { add: (participant) => MatchmakingQueue.getInstance().getPool().add(participant) },
			spawnBot: jest.fn(),
		}),
	});
	return MatchmakingQueue.getInstance().getPool();
}

describe("Matchmaking end-to-end pairing", () => {
	afterEach(() => {
		MatchmakingQueue.resetForTests();
		jest.restoreAllMocks();
		createMatchmakingRoomMock.mockReset();
	});

	it("pairs one socket participant with one poll participant through the shared pool", async () => {
		const pool = initQueue();
		const { socket, eventEmitter } = connectSocket(pool, fakeTickets({ "ticket-a": "user-a" }));
		const send = jest.spyOn(socket, "send");

		emit(eventEmitter, Commands.PLAYER_INFO, Buffer.from("Alice", "utf16le"));
		emit(eventEmitter, Commands.MATCHMAKING_AUTH, authBody("ticket-a"));
		await flush();
		emit(eventEmitter, Commands.MATCHMAKING_ENTER, enterBody());
		MatchmakingQueue.getInstance().enqueue({ ticketId: "poll-1", userId: "user-b", format: "tcg" });

		const record = MatchmakingQueue.getInstance().get("poll-1");
		expect(record?.state).toBe("matched");
		expect(record?.roomPassword).toBe("tt,mm555#pw123456");
		expect(receivedFound(send)).toBe(true);
	});

	it("admits both real sockets through MATCH_ADMIT when two humans pair", async () => {
		const pool = initQueue();
		const tickets = fakeTickets({ "ticket-a": "user-a", "ticket-b": "user-b" });
		const a = connectSocket(pool, tickets);
		const b = connectSocket(pool, tickets);

		for (const [connection, ticket] of [
			[a, "ticket-a"],
			[b, "ticket-b"],
		] as const) {
			emit(connection.eventEmitter, Commands.PLAYER_INFO, Buffer.from("Player", "utf16le"));
			emit(connection.eventEmitter, Commands.MATCHMAKING_AUTH, authBody(ticket));
		}
		await flush();
		emit(a.eventEmitter, Commands.MATCHMAKING_ENTER, enterBody());
		emit(b.eventEmitter, Commands.MATCHMAKING_ENTER, enterBody());

		const room = createMatchmakingRoomMock.mock.results[0]?.value.room;
		expect(room.emit).toHaveBeenCalledWith("MATCH_ADMIT", expect.anything(), a.socket);
		expect(room.emit).toHaveBeenCalledWith("MATCH_ADMIT", expect.anything(), b.socket);
	});
});
