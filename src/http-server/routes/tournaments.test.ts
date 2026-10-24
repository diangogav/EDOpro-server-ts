import { randomUUID } from "crypto";
import { mkdtemp, rm } from "fs/promises";
import { Server } from "http";
import { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import express from "express";
import { mock } from "jest-mock-extended";

import { TicketRepository } from "@shared/ticket/domain/TicketRepository";
import { DisplayNameResolver } from "@ygopro/matchmaking/domain/DisplayNameResolver";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import { loadTournamentRoutes } from "./tournaments";

describe("Tournament HTTP API", () => {
	let folder: string, url: string, server: Server;
	let closeStore: () => Promise<void>;
	let tokens: Map<string, string>;
	beforeEach(async () => {
		folder = await mkdtemp(join(tmpdir(), "evolution-tournament-http-"));
		tokens = new Map();
		const tickets = mock<TicketRepository>();
		tickets.consume.mockImplementation(async (token) => {
			const actor = tokens.get(token) ?? null;
			tokens.delete(token);
			return actor;
		});
		const names = mock<DisplayNameResolver>();
		names.resolve.mockImplementation(async (actor) => `Public ${actor}`);
		const app = express();
		app.use(express.json());
		closeStore = loadTournamentRoutes(
			app,
			new LoggerMock(),
			tickets,
			names,
			join(folder, "brackets.sqlite"),
		);
		server = app.listen(0, "127.0.0.1");
		await new Promise<void>((resolve) => server.once("listening", resolve));
		url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});
	afterEach(async () => {
		await new Promise<void>((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
		await closeStore();
		await rm(folder, { recursive: true, force: true });
	});
	const request = async (actor: string, path: string, body?: unknown, token?: string) => {
		const auth = token ?? randomUUID();
		if (!token) tokens.set(auth, actor);
		const response = await fetch(url + path, {
			method: body === undefined ? "GET" : "POST",
			headers: { Authorization: `Bearer ${auth}`, "Content-Type": "application/json" },
			body: body === undefined ? undefined : JSON.stringify(body),
		});
		return { status: response.status, body: await response.json() };
	};

	it("runs a normal-player tournament through authentication, registration, best-of result and idempotent retry", async () => {
		const created = await request("owner", "/api/tournaments", {
			name: "Community cup",
			format: "tcg",
			bestOf: 3,
			capacity: 4,
		});
		expect(created.status).toBe(201);
		const id = created.body.data.id;
		const path = `/api/tournaments/${id}`;
		expect((await request("alice", path + "/join", { revision: 0 })).status).toBe(200);
		expect((await request("bob", path + "/join", { revision: 0 })).status).toBe(409);
		expect((await request("bob", path + "/join", { revision: 1, characterId: 12 })).status).toBe(
			200,
		);
		expect((await request("alice", path + "/start", { revision: 2 })).status).toBe(403);
		expect((await request("owner", path + "/start", { revision: 2 })).status).toBe(200);
		expect((await request("carol", path + "/join", { revision: 3 })).status).toBe(409);
		expect(
			(await request("bob", path + "/matches/r1m1/result", { revision: 3, winsA: 0, winsB: 2 }))
				.status,
		).toBe(403);
		const completed = await request("owner", path + "/matches/r1m1/result", {
			revision: 3,
			winsA: 2,
			winsB: 1,
		});
		expect(completed.status).toBe(200);
		expect(completed.body.data.status).toBe("completed");
		expect(completed.body.data.matches[0].result).toMatchObject({
			source: "organizer",
			reportedBy: "organizer",
			winsA: 2,
			winsB: 1,
		});
		const retry = await request("owner", path + "/matches/r1m1/result", {
			revision: 3,
			winsA: 2,
			winsB: 1,
		});
		expect(retry.body).toEqual(completed.body);
		const spectator = await request("viewer", path);
		expect(spectator.body.data.isOrganizer).toBe(false);
		expect(spectator.body.data.myEntrantId).toBeNull();
		expect(spectator.body.data.entrants[0]).toEqual(
			expect.objectContaining({ displayName: "Public alice", characterId: null }),
		);
		expect(JSON.stringify(spectator.body)).not.toMatch(/userId|organizerId|reportedByUserId/);
	});

	it("rejects forged fields and a reused authentication ticket", async () => {
		const forged = await request("owner", "/api/tournaments", {
			name: "Cup",
			format: "tcg",
			bestOf: 3,
			capacity: 4,
			organizerId: "victim",
		});
		expect(forged.status).toBe(400);
		const token = randomUUID();
		tokens.set(token, "owner");
		const body = { name: "Cup", format: "tcg", bestOf: 1, capacity: 2 };
		expect((await request("owner", "/api/tournaments", body, token)).status).toBe(201);
		expect((await request("owner", "/api/tournaments", body, token)).status).toBe(401);
	});

	it("restricts cancellation to the organizer and keeps the cancellation readable", async () => {
		const created = await request("owner", "/api/tournaments", {
			name: "Cup",
			format: "edison",
			bestOf: 5,
			capacity: 8,
		});
		const path = `/api/tournaments/${created.body.data.id}`;
		expect((await request("viewer", path + "/cancel", { revision: 0 })).status).toBe(403);
		const cancelled = await request("owner", path + "/cancel", {
			revision: 0,
			reason: "Rescheduled",
		});
		expect(cancelled.body.data).toMatchObject({
			status: "cancelled",
			cancellationReason: "Rescheduled",
			revision: 1,
		});
		expect((await request("owner", path + "/cancel", { revision: 0 })).body).toEqual(
			cancelled.body,
		);
	});
});
