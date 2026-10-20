import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ExpressReconnectHandler } from "@shared/room/application/reconnect/ExpressReconnectHandler";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoClient } from "@shared/client/domain/YgoClient";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { MatchmakingPool } from "../domain/MatchmakingPool";
import { Session } from "../domain/Session";
import { SocketParticipantChannel } from "../infrastructure/SocketParticipantChannel";
import { AuthenticateMatchmakingSession } from "./AuthenticateMatchmakingSession";
import { CancelMatchmaking } from "./CancelMatchmaking";
import { EnterMatchmaking } from "./EnterMatchmaking";
import { MatchmakingConnectionHandler } from "./MatchmakingConnectionHandler";

const logger: Logger = new LoggerMock();
const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
const emit = (emitter: EventEmitter, command: Commands, data: Buffer): boolean =>
	emitter.emit(command as unknown as string, { data });
const authBody = (ticket: string): Buffer => {
	const bytes = Buffer.from(ticket, "utf8");

	return Buffer.concat([Buffer.from([bytes.length]), bytes]);
};

describe("TCP token reconnect of a verified seat", () => {
	const verifiedSeat = {
		name: "Alice",
		credential: { kind: "verified", userId: "user-a" },
	} as unknown as YgoClient;
	let room: { emit: jest.Mock };
	let socket: SocketMock;
	let emitter: EventEmitter;

	beforeEach(() => {
		TokenIndex.getInstance().clear();
		TokenIndex.getInstance().register("tok", verifiedSeat, 1);
		room = { emit: jest.fn() };
		socket = new SocketMock();
		jest.spyOn(socket, "destroy");
		emitter = new EventEmitter();
		// Only AUTH is exercised; the queue is never entered.
		const pool = {} as unknown as MatchmakingPool;
		const tickets: TicketRepository = {
			consume: jest.fn(async (ticket: string) => (ticket === "good" ? "user-a" : null)),
		};
		new MatchmakingConnectionHandler(
			emitter,
			socket,
			new Session(socket),
			new SocketParticipantChannel(socket),
			new AuthenticateMatchmakingSession(
				tickets,
				{ isBanned: jest.fn().mockResolvedValue(false) },
				{ resolve: jest.fn().mockResolvedValue(null) },
				logger,
			),
			new EnterMatchmaking(pool, () => Date.now(), logger),
			new CancelMatchmaking(pool, logger),
			logger,
		);
		new ExpressReconnectHandler(
			emitter,
			logger,
			socket,
			() => room as unknown as YgoRoom,
			() => true,
		);
	});

	afterEach(() => TokenIndex.getInstance().clear());

	it("succeeds once 0xfb authenticated the connection before 0xfd is sent", async () => {
		emit(emitter, Commands.MATCHMAKING_AUTH, authBody("good"));
		await flush();
		emit(emitter, Commands.RECONNECT, Buffer.from("tok", "utf8"));

		expect(socket.resolvedUserId).toBe("user-a");
		expect(room.emit).toHaveBeenCalledWith("EXPRESS_RECONNECT", expect.anything(), socket);
		expect(socket.destroy).not.toHaveBeenCalled();
	});

	it("is refused when 0xfd arrives without a prior 0xfb", () => {
		emit(emitter, Commands.RECONNECT, Buffer.from("tok", "utf8"));

		expect(room.emit).not.toHaveBeenCalled();
		expect(socket.destroy).toHaveBeenCalled();
	});
});
