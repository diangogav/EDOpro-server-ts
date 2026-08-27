import type { Request, Response } from "express";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";

import { DisplayNameResolver } from "@ygopro/matchmaking/domain/DisplayNameResolver";

import { EnqueueMatchmakingController } from "./EnqueueMatchmakingController";

const makeLogger = () =>
	({
		child: jest.fn().mockReturnThis(),
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	}) as never;

const makeTickets = (userId: string | null): TicketRepository => ({
	consume: jest.fn().mockResolvedValue(userId),
});

function fakeResponse(): { res: Response; body: () => unknown; status: () => number } {
	let statusCode = 0;
	let payload: unknown;
	const res = {
		status(code: number) {
			statusCode = code;
			return this;
		},
		json(data: unknown) {
			payload = data;
			return this;
		},
	} as unknown as Response;
	return { res, body: () => payload, status: () => statusCode };
}

const makeDeps = () => ({
	now: () => 0,
	createRankedRoom: () => ({ roomId: 1, roomPassword: "to,mm-r#pw" }),
	createBotRoom: () => ({ roomPassword: "to,mm-b#pw", roomId: 1 }),
	spawnBot: jest.fn(),
});

describe("EnqueueMatchmakingController", () => {
	beforeEach(() => {
		MatchmakingQueue.resetForTests();
		MatchmakingQueue.init(makeDeps());
	});
	afterEach(() => {
		MatchmakingQueue.resetForTests();
	});

	const makeResolver = (name: string | null): DisplayNameResolver => ({
		resolve: jest.fn().mockResolvedValue(name),
	});

	const run = async (
		body: unknown,
		tickets: TicketRepository,
		displayNames: DisplayNameResolver = makeResolver(null),
	) => {
		const out = fakeResponse();
		await new EnqueueMatchmakingController(makeLogger(), tickets, displayNames).run(
			{ body } as Request,
			out.res,
		);
		return out;
	};

	it("returns a ticketId (200) for a valid ticket and queues the user", async () => {
		const out = await run(
			{ format: "tcg", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
		);

		expect(out.status()).toBe(200);
		const body = out.body() as { ticketId: string };
		expect(typeof body.ticketId).toBe("string");
		expect(MatchmakingQueue.getInstance().get(body.ticketId)).toBeDefined();
	});

	it("rejects a request with a missing/invalid schema (400)", async () => {
		const out = await run({ format: "tcg" }, makeTickets("user-1"));
		expect(out.status()).toBe(400);
	});

	it("rejects an unsupported format (400)", async () => {
		const out = await run(
			{ format: "ocg", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
		);
		expect(out.status()).toBe(400);
	});

	it("accepts jtp format (200) — valid JTP enqueue", async () => {
		const out = await run(
			{ format: "jtp", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-jtp"),
		);
		expect(out.status()).toBe(200);
		const body = out.body() as { ticketId: string };
		expect(typeof body.ticketId).toBe("string");
		// The queued entry must carry the requested format, not silently fall back to tcg.
		expect(MatchmakingQueue.getInstance().get(body.ticketId)?.format).toBe("jtp");
	});

	it("rejects genesys format (400) — Genesys format rejected", async () => {
		const out = await run(
			{ format: "genesys", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
		);
		expect(out.status()).toBe(400);
	});

	it("rejects unknown format string (400) — Unknown format rejected", async () => {
		const out = await run(
			{ format: "arbitrary-unknown", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
		);
		expect(out.status()).toBe(400);
	});

	it("rejects when the ticket does not resolve to a user (401)", async () => {
		const out = await run(
			{ format: "tcg", queue: "ranked", ticket: "bad-ticket" },
			makeTickets(null),
		);
		expect(out.status()).toBe(401);
	});

	it("resolves the user's display name at enqueue and stores it on the entry", async () => {
		const resolver = makeResolver("Yugi");
		const out = await run(
			{ format: "tcg", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
			resolver,
		);

		expect(out.status()).toBe(200);
		expect(resolver.resolve).toHaveBeenCalledWith("user-1");
		const body = out.body() as { ticketId: string };
		expect(MatchmakingQueue.getInstance().get(body.ticketId)?.displayName).toBe("Yugi");
	});

	it("stores a null display name when the resolver finds none", async () => {
		const out = await run(
			{ format: "tcg", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
			makeResolver(null),
		);

		expect(out.status()).toBe(200);
		const body = out.body() as { ticketId: string };
		expect(MatchmakingQueue.getInstance().get(body.ticketId)?.displayName).toBeNull();
	});

	it("still enqueues (200) with a null display name when resolution fails", async () => {
		const resolver: DisplayNameResolver = {
			resolve: jest.fn().mockRejectedValue(new Error("db down")),
		};
		const out = await run(
			{ format: "tcg", queue: "ranked", ticket: "the-ticket" },
			makeTickets("user-1"),
			resolver,
		);

		expect(out.status()).toBe(200);
		const body = out.body() as { ticketId: string };
		expect(MatchmakingQueue.getInstance().get(body.ticketId)?.displayName).toBeNull();
	});

	it("returns the existing ticketId when the same user enqueues twice (409-safe idempotency)", async () => {
		const tickets = makeTickets("user-1");
		const first = await run({ format: "tcg", queue: "ranked", ticket: "t-a" }, tickets);
		const second = await run({ format: "tcg", queue: "ranked", ticket: "t-b" }, tickets);

		expect(first.status()).toBe(200);
		expect(second.status()).toBe(409);
	});

	it("answers a duplicate enqueue (409) without resolving a display name", async () => {
		const tickets = makeTickets("user-1");
		await run({ format: "tcg", queue: "ranked", ticket: "t-a" }, tickets);

		const resolver = makeResolver("Yugi");
		const second = await run({ format: "tcg", queue: "ranked", ticket: "t-b" }, tickets, resolver);

		expect(second.status()).toBe(409);
		expect(second.body()).toEqual({ success: false, error: "Already in queue" });
		expect(resolver.resolve).not.toHaveBeenCalled();
	});
});
