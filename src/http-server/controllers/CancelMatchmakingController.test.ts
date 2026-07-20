import type { Request, Response } from "express";

import { MatchmakingQueue } from "@ygopro/matchmaking/domain/MatchmakingQueue";
import { SUPPORTED_FORMAT } from "@ygopro/matchmaking/domain/QueueEntry";

import { CancelMatchmakingController } from "./CancelMatchmakingController";

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
	new CancelMatchmakingController().run({ query } as Request, out.res);
	return out;
};

describe("CancelMatchmakingController", () => {
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

	it("removes a queued entry and returns 200", () => {
		MatchmakingQueue.getInstance().enqueue({
			ticketId: "t1",
			userId: "user-1",
			format: SUPPORTED_FORMAT,
		});

		const out = run({ ticketId: "t1" });
		expect(out.status()).toBe(200);
		expect(MatchmakingQueue.getInstance().get("t1")).toBeUndefined();
	});
});
