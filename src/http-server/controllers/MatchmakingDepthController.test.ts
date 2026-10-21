import type { Request, Response } from "express";

import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";

import { MatchmakingDepthController } from "./MatchmakingDepthController";

function fakeResponse(): {
	res: Response;
	body: () => unknown;
	status: () => number;
	headers: Record<string, string>;
} {
	let statusCode = 0;
	let payload: unknown;
	const headers: Record<string, string> = {};
	const res = {
		status(code: number) {
			statusCode = code;
			return this;
		},
		json(data: unknown) {
			payload = data;
			return this;
		},
		set(name: string, value: string) {
			headers[name] = value;
			return this;
		},
	} as unknown as Response;
	return { res, body: () => payload, status: () => statusCode, headers };
}

const makeDeps = () => ({
	now: () => 0,
	createRankedRoom: () => ({ roomId: 1, roomPassword: "to,mm-r#pw" }),
	createBotRoom: () => ({ roomPassword: "to,mm-b#pw", roomId: 1 }),
	spawnBot: jest.fn(),
});

const run = () => {
	const out = fakeResponse();
	new MatchmakingDepthController().run({} as Request, out.res);
	return out;
};

describe("MatchmakingDepthController", () => {
	beforeEach(() => {
		MatchmakingQueue.resetForTests();
		MatchmakingQueue.init(makeDeps());
	});
	afterEach(() => {
		MatchmakingQueue.resetForTests();
	});

	it("returns how many players are searching in each format", () => {
		MatchmakingQueue.getInstance().enqueue({ ticketId: "t1", userId: "user-1", format: "edison" });

		const out = run();

		expect(out.status()).toBe(200);
		expect(out.body()).toEqual({ formats: { tcg: 0, jtp: 0, edison: 1 } });
	});

	it("lets clients and proxies cache the counts for a few seconds", () => {
		expect(run().headers["Cache-Control"]).toBe("public, max-age=5");
	});
});
