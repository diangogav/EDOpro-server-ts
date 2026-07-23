import type { Request, Response } from "express";

import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";

import { MatchmakingStatusController } from "./MatchmakingStatusController";

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
	createRankedRoom: () => ({ roomPassword: "to,mm-r#pw" }),
	createBotRoom: () => ({ roomPassword: "to,mm-b#pw", roomId: 1 }),
	spawnBot: jest.fn(),
});

const run = (query: unknown) => {
	const out = fakeResponse();
	new MatchmakingStatusController().run({ query } as Request, out.res);
	return out;
};

describe("MatchmakingStatusController", () => {
	beforeEach(() => {
		MatchmakingQueue.resetForTests();
		MatchmakingQueue.init(makeDeps());
	});
	afterEach(() => {
		MatchmakingQueue.resetForTests();
	});

	it("returns 400 when ticketId is missing", () => {
		expect(run({}).status()).toBe(400);
	});

	it("returns 404 for an unknown ticketId", () => {
		expect(run({ ticketId: "nope" }).status()).toBe(404);
	});

	it("returns 200 searching with waitedMs for a queued ticket", () => {
		MatchmakingQueue.getInstance().enqueue({
			ticketId: "t1",
			userId: "user-1",
			format: "tcg",
		});

		const out = run({ ticketId: "t1" });
		expect(out.status()).toBe(200);
		expect(out.body()).toEqual({ state: "searching", waitedMs: 0 });
	});

	it("returns 200 matched once paired", () => {
		const q = MatchmakingQueue.getInstance();
		q.enqueue({ ticketId: "t1", userId: "user-1", format: "tcg" });
		q.enqueue({ ticketId: "t2", userId: "user-2", format: "tcg" });

		const out = run({ ticketId: "t1" });
		expect(out.status()).toBe(200);
		expect(out.body()).toMatchObject({
			state: "matched",
			opponentType: "human",
			rated: true,
		});
	});
});
