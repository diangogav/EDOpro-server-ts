import { randomUUID } from "crypto";
import { Request, Response } from "express";
import { mock } from "jest-mock-extended";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { createTournamentAuthMiddleware } from "./TournamentAuthMiddleware";

describe("TournamentAuthMiddleware", () => {
	it.each([
		undefined,
		"Bearer invalid",
		"Basic " + randomUUID(),
	])("refuses malformed authentication without consuming a ticket", async (authorization) => {
		const tickets = mock<TicketRepository>();
		const request = { get: () => authorization } as unknown as Request;
		const response = mock<Response>();
		response.status.mockReturnThis();
		const next = jest.fn();
		await createTournamentAuthMiddleware(tickets, new LoggerMock())(request, response, next);
		expect(response.status).toHaveBeenCalledWith(401);
		expect(tickets.consume).not.toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
	});

	it("derives the account only from the consumed one-use ticket", async () => {
		const token = randomUUID();
		const tickets = mock<TicketRepository>();
		tickets.consume.mockResolvedValue("actual-account");
		const response = mock<Response>();
		response.locals = {};
		response.status.mockReturnThis();
		const next = jest.fn();
		await createTournamentAuthMiddleware(tickets, new LoggerMock())(
			{ get: () => `Bearer ${token}`, body: { userId: "forged-account" } } as unknown as Request,
			response,
			next,
		);
		expect(tickets.consume).toHaveBeenCalledWith(token);
		expect(response.locals.tournamentUserId).toBe("actual-account");
		expect(next).toHaveBeenCalledTimes(1);
	});

	it("fails closed when authentication storage fails", async () => {
		const tickets = mock<TicketRepository>();
		tickets.consume.mockRejectedValue(new Error("private datastore details"));
		const response = mock<Response>();
		response.status.mockReturnThis();
		const next = jest.fn();
		await createTournamentAuthMiddleware(tickets, new LoggerMock())(
			{ get: () => `Bearer ${randomUUID()}` } as unknown as Request,
			response,
			next,
		);
		expect(response.status).toHaveBeenCalledWith(503);
		expect(next).not.toHaveBeenCalled();
	});
});
