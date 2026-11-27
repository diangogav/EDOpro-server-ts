import type { Request, Response } from "express";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";

import { ActiveDuelController } from "./ActiveDuelController";

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

const tickets = (userId: string | null): TicketRepository => ({
	consume: jest.fn().mockResolvedValue(userId),
});
const request = (body: unknown) => ({ body }) as Request;

describe("ActiveDuelController", () => {
	it("answers that the account holds a seat", async () => {
		const { res, body, status } = fakeResponse();

		await new ActiveDuelController(tickets("user-1"), (userId) => userId === "user-1").run(
			request({ ticket: "t" }),
			res,
		);

		expect(status()).toBe(200);
		expect(body()).toEqual({ inDuel: true });
	});

	it("answers that the account holds no seat", async () => {
		const { res, body } = fakeResponse();

		await new ActiveDuelController(tickets("user-1"), () => false).run(
			request({ ticket: "t" }),
			res,
		);

		expect(body()).toEqual({ inDuel: false });
	});

	it("answers 401 for an invalid, expired or reused ticket without looking for a seat", async () => {
		const { res, status } = fakeResponse();
		const holdsSeat = jest.fn();

		await new ActiveDuelController(tickets(null), holdsSeat).run(request({ ticket: "t" }), res);

		expect(status()).toBe(401);
		expect(holdsSeat).not.toHaveBeenCalled();
	});

	it("answers 400 without a ticket", async () => {
		const { res, status } = fakeResponse();

		await new ActiveDuelController(tickets("user-1"), () => true).run(request({}), res);

		expect(status()).toBe(400);
	});
});
