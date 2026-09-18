import { mock, MockProxy } from "jest-mock-extended";

import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { SocketMock } from "@test-support/mocks/socket/SocketMock";

import { config } from "../../../config";
import { BanChecker } from "../domain/BanChecker";
import { DisplayNameResolver } from "../domain/DisplayNameResolver";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";
import { AuthenticateMatchmakingSession } from "./AuthenticateMatchmakingSession";

class FakeRedis {
	private counters = new Map<string, number>();

	async incr(key: string): Promise<number> {
		const next = (this.counters.get(key) ?? 0) + 1;
		this.counters.set(key, next);

		return next;
	}

	async expire(_key: string, _seconds: number): Promise<unknown> {
		return 1;
	}
}

describe("AuthenticateMatchmakingSession", () => {
	let tickets: MockProxy<TicketRepository>;
	let bans: MockProxy<BanChecker>;
	let displayNames: MockProxy<DisplayNameResolver>;
	let logger: LoggerMock;
	let warnSpy: jest.SpyInstance;
	let useCase: AuthenticateMatchmakingSession;
	let store: FakeRedis;
	let enabledBefore: boolean;
	let limitBefore: number;
	let windowBefore: number;

	const REMOTE_ADDRESS = "203.0.113.7";

	const makeParticipant = () => {
		const socket = new SocketMock();
		const session = new Session(socket);
		const channel = mock<ParticipantChannel>();

		return { socket, session, channel };
	};

	beforeEach(() => {
		tickets = mock<TicketRepository>();
		bans = mock<BanChecker>();
		displayNames = mock<DisplayNameResolver>();
		logger = new LoggerMock();
		warnSpy = jest.spyOn(logger, "warn");
		useCase = new AuthenticateMatchmakingSession(tickets, bans, displayNames, logger);

		store = new FakeRedis();
		jest
			.spyOn(Redis, "getInstance")
			.mockReturnValue(store as unknown as ReturnType<typeof Redis.getInstance>);

		enabledBefore = config.rateLimit.enabled;
		limitBefore = config.rateLimit.join.limit;
		windowBefore = config.rateLimit.join.window;
		config.rateLimit.enabled = true;
		config.rateLimit.join.limit = 2;
		config.rateLimit.join.window = 60;

		tickets.consume.mockResolvedValue("user-1");
		bans.isBanned.mockResolvedValue(false);
		displayNames.resolve.mockResolvedValue(null);
	});

	afterEach(() => {
		config.rateLimit.enabled = enabledBefore;
		config.rateLimit.join.limit = limitBefore;
		config.rateLimit.join.window = windowBefore;
		jest.restoreAllMocks();
	});

	it("rejects AUTH attempts over the per-IP limit, closes the connection, and never consumes a ticket", async () => {
		for (let i = 0; i < config.rateLimit.join.limit; i++) {
			const { session, channel } = makeParticipant();
			await useCase.execute({
				ticket: `ticket-${i}`,
				remoteAddress: REMOTE_ADDRESS,
				session,
				channel,
			});
		}
		expect(tickets.consume).toHaveBeenCalledTimes(config.rateLimit.join.limit);

		const { session, channel } = makeParticipant();
		await useCase.execute({
			ticket: "ticket-over",
			remoteAddress: REMOTE_ADDRESS,
			session,
			channel,
		});

		expect(tickets.consume).toHaveBeenCalledTimes(config.rateLimit.join.limit);
		expect(channel.close).toHaveBeenCalledWith("rate_limited");
		expect(session.isAuthenticated).toBe(false);
		expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
			reason: "rate_limited",
			opcode: "AUTH",
			remoteAddress: REMOTE_ADDRESS,
		});
	});

	it("fails open and authenticates when the rate limiter's backing store errors", async () => {
		jest.spyOn(store, "incr").mockRejectedValue(new Error("redis down"));
		const { session, channel } = makeParticipant();

		await useCase.execute({ ticket: "ticket-1", remoteAddress: REMOTE_ADDRESS, session, channel });

		expect(tickets.consume).toHaveBeenCalledWith("ticket-1");
		expect(session.isAuthenticated).toBe(true);
		expect(channel.close).not.toHaveBeenCalled();
	});

	it("rejects a second AUTH on an already authenticated session without consuming another ticket", async () => {
		const { session, channel } = makeParticipant();
		session.authenticate("already-authed-user");

		await useCase.execute({ ticket: "ticket-2", remoteAddress: REMOTE_ADDRESS, session, channel });

		expect(tickets.consume).not.toHaveBeenCalled();
		expect(channel.status).toHaveBeenCalledWith({
			state: "rejected",
			waitedMs: 0,
			reason: "already_authenticated",
		});
		expect(channel.close).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
			reason: "already_authenticated",
			opcode: "AUTH",
		});
	});

	it("rejects an invalid, expired, or reused ticket, closes the connection, and leaves the session unauthenticated", async () => {
		tickets.consume.mockResolvedValueOnce(null);
		const { session, channel } = makeParticipant();

		await useCase.execute({
			ticket: "bad-ticket",
			remoteAddress: REMOTE_ADDRESS,
			session,
			channel,
		});

		expect(channel.close).toHaveBeenCalledWith("invalid_ticket");
		expect(session.isAuthenticated).toBe(false);
		expect(bans.isBanned).not.toHaveBeenCalled();
		expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
			reason: "invalid_ticket",
			opcode: "AUTH",
		});
	});

	it("rejects a banned user and closes the connection, with the ticket already consumed", async () => {
		bans.isBanned.mockResolvedValueOnce(true);
		const { session, channel } = makeParticipant();

		await useCase.execute({ ticket: "ticket-3", remoteAddress: REMOTE_ADDRESS, session, channel });

		expect(tickets.consume).toHaveBeenCalledTimes(1);
		expect(channel.close).toHaveBeenCalledWith("banned");
		expect(session.isAuthenticated).toBe(false);
		expect(warnSpy).toHaveBeenCalledWith("matchmaking.rejected", {
			reason: "banned",
			opcode: "AUTH",
		});
	});

	it("authenticates successfully with a null display name when the resolver throws", async () => {
		displayNames.resolve.mockRejectedValueOnce(new Error("db down"));
		const { session, channel } = makeParticipant();

		await useCase.execute({ ticket: "ticket-4", remoteAddress: REMOTE_ADDRESS, session, channel });

		expect(session.isAuthenticated).toBe(true);
		expect(session.displayName).toBeNull();
		expect(channel.status).toHaveBeenCalledWith({ state: "authenticated", waitedMs: 0 });
	});

	it("authenticates a valid ticket, stamping the session with the resolved identity", async () => {
		displayNames.resolve.mockResolvedValueOnce("Yugi");
		const { socket, session, channel } = makeParticipant();

		await useCase.execute({ ticket: "ticket-5", remoteAddress: REMOTE_ADDRESS, session, channel });

		expect(session.isAuthenticated).toBe(true);
		expect(session.displayName).toBe("Yugi");
		expect(socket.resolvedUserId).toBe("user-1");
		expect(channel.status).toHaveBeenCalledWith({ state: "authenticated", waitedMs: 0 });
	});

	it("never logs the raw ticket bytes across rejection and success paths", async () => {
		const infoSpy = jest.spyOn(logger, "info");
		const warnSpy = jest.spyOn(logger, "warn");
		const errorSpy = jest.spyOn(logger, "error");

		const secretTicket = "super-secret-ticket-value";
		tickets.consume.mockResolvedValueOnce(null);
		const rejected = makeParticipant();
		await useCase.execute({
			ticket: secretTicket,
			remoteAddress: REMOTE_ADDRESS,
			session: rejected.session,
			channel: rejected.channel,
		});

		displayNames.resolve.mockRejectedValueOnce(new Error("db down"));
		const accepted = makeParticipant();
		await useCase.execute({
			ticket: secretTicket,
			remoteAddress: REMOTE_ADDRESS,
			session: accepted.session,
			channel: accepted.channel,
		});

		const allLoggedText = [...infoSpy.mock.calls, ...warnSpy.mock.calls, ...errorSpy.mock.calls]
			.flat()
			.map((arg) => JSON.stringify(arg))
			.join(" ");
		expect(allLoggedText).not.toContain(secretTicket);
	});
});
