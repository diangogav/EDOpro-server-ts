import { mock } from "jest-mock-extended";

import { Logger } from "@shared/logger/domain/Logger";
import { HandshakeTicketStore, TicketConsumeResult } from "@shared/ticket/domain/TicketRepository";

import { PresenceStatus } from "../domain/PresenceStatus";
import {
	ChallengeMatchmaking,
	ChallengeRoomIssuer,
	PresenceAccounts,
	PresenceHub,
	PresenceMessage,
	PresenceTransport,
} from "./PresenceHub";

const TICKET = "8a6e0804-2bd0-4672-b79d-d97027f9071a";

class FakeTransport implements PresenceTransport {
	public readonly sent = new Map<string, PresenceMessage[]>();
	public readonly closed: string[] = [];

	public send(socketId: string, message: PresenceMessage): void {
		const messages = this.sent.get(socketId) ?? [];
		messages.push(message);
		this.sent.set(socketId, messages);
	}

	public close(socketId: string): void {
		this.closed.push(socketId);
	}

	public of(socketId: string): PresenceMessage[] {
		return this.sent.get(socketId) ?? [];
	}

	public last(socketId: string): PresenceMessage | undefined {
		return this.of(socketId).at(-1);
	}

	public reset(): void {
		this.sent.clear();
	}
}

class FakeScheduler {
	private readonly timers: Array<{ callback: () => void; delayMs: number; cancelled: boolean }> =
		[];

	public readonly schedule = (callback: () => void, delayMs: number): (() => void) => {
		const timer = { callback, delayMs, cancelled: false };
		this.timers.push(timer);

		return () => {
			timer.cancelled = true;
		};
	};

	public live(): number[] {
		return this.timers.filter((timer) => !timer.cancelled).map((timer) => timer.delayMs);
	}

	public fireAll(): void {
		for (const timer of this.timers.splice(0)) {
			if (!timer.cancelled) {
				timer.callback();
			}
		}
	}
}

const makeHub = (
	overrides: {
		ticket?: TicketConsumeResult;
		username?: string | null;
		banned?: boolean;
		statusOf?: (userId: string) => PresenceStatus;
		now?: () => number;
		isMatched?: (userId: string) => boolean;
	} = {},
) => {
	const transport = new FakeTransport();
	const scheduler = new FakeScheduler();
	const tickets: HandshakeTicketStore = {
		consumeWithStatus: jest.fn(async (ticket: string) =>
			overrides.ticket
				? overrides.ticket
				: { status: "consumed" as const, userId: ticket === TICKET ? "user-1" : ticket },
		),
	};
	const matchmaking: ChallengeMatchmaking = {
		isMatched: jest.fn(overrides.isMatched ?? (() => false)),
		removeUser: jest.fn(),
	};
	const rooms: ChallengeRoomIssuer = {
		issue: jest.fn(() => ({ code: "abcdefgh01234567" })),
	};
	let challengeIds = 0;
	const accounts: PresenceAccounts = {
		findUsername: jest
			.fn()
			.mockResolvedValue(overrides.username === undefined ? "Yugi" : overrides.username),
		isBanned: jest.fn().mockResolvedValue(overrides.banned ?? false),
	};
	let guestIds = 0;
	const hub = new PresenceHub({
		transport,
		tickets,
		accounts,
		statusProbe: { statusOf: overrides.statusOf ?? (() => "free") },
		logger: mock<Logger>(),
		newGuestId: () => `guest-${++guestIds}`,
		now: overrides.now ?? (() => 0),
		matchmaking,
		challengeRooms: rooms,
		schedule: scheduler.schedule,
		newChallengeId: () => `challenge-${++challengeIds}`,
	});

	return { hub, transport, tickets, scheduler, matchmaking, rooms };
};

const hello = (data: Record<string, unknown>): string =>
	JSON.stringify({ action: "PRESENCE-HELLO", data });

describe("PresenceHub", () => {
	it("welcomes a guest with its own id and the list, and announces it to the others", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		hub.connect("b");
		await hub.message("a", hello({ name: "Joey", formats: ["edison"] }));
		transport.reset();

		await hub.message(
			"b",
			hello({
				name: "  Mai   Valentine ",
				formats: ["goat", "tcg", "unknown"],
				status: "searching",
			}),
		);

		const mai = {
			id: "g:guest-2",
			name: "Mai Valentine",
			account: false,
			userId: null,
			formats: ["tcg", "goat"],
			status: "searching",
			muted: false,
		};
		expect(transport.of("b")).toEqual([
			{
				action: "PRESENCE-WELCOME",
				data: {
					self: "g:guest-2",
					players: [
						{
							id: "g:guest-1",
							name: "Joey",
							account: false,
							userId: null,
							formats: ["edison"],
							status: "free",
							muted: false,
						},
						mai,
					],
				},
			},
		]);
		expect(transport.of("a")).toEqual([{ action: "PRESENCE-JOIN", data: mai }]);
	});

	it("identifies an account by its ticket, with its username and the status the server sees", async () => {
		const { hub, transport, tickets } = makeHub({ statusOf: () => "in-duel" });
		hub.connect("a");

		await hub.message(
			"a",
			hello({ ticket: TICKET, name: "ignored", formats: ["edison"], status: "free" }),
		);

		expect(tickets.consumeWithStatus).toHaveBeenCalledWith(TICKET);
		expect(transport.last("a")).toEqual({
			action: "PRESENCE-WELCOME",
			data: {
				self: "u:user-1",
				players: [
					{
						id: "u:user-1",
						name: "Yugi",
						account: true,
						userId: "user-1",
						formats: ["edison"],
						status: "in-duel",
						muted: false,
					},
				],
			},
		});
	});

	it.each([
		[
			"an invalid ticket",
			{ ticket: { status: "invalid" } as TicketConsumeResult },
			"invalid-ticket",
		],
		[
			"an unavailable ticket store",
			{ ticket: { status: "unavailable" } as TicketConsumeResult },
			"auth-unavailable",
		],
		["a banned account", { banned: true }, "banned"],
		["an account without a profile", { username: null }, "invalid-ticket"],
	])("refuses %s and leaves the socket out of the list", async (_label, overrides, code) => {
		const { hub, transport } = makeHub(overrides);
		hub.connect("a");
		hub.connect("b");
		await hub.message("b", hello({ name: "Joey", formats: [] }));
		transport.reset();

		await hub.message("a", hello({ ticket: TICKET, formats: [] }));

		expect(transport.of("a")).toEqual([{ action: "PRESENCE-ERROR", data: { code } }]);
		expect(transport.of("b")).toEqual([]);
	});

	it.each([
		["a missing name", { formats: [] }, "invalid-name"],
		["a name longer than 20 characters", { name: "x".repeat(21), formats: [] }, "invalid-name"],
		["formats that are not a list", { name: "Joey", formats: "edison" }, "invalid-hello"],
		["an unknown status", { name: "Joey", formats: [], status: "away" }, "invalid-hello"],
	])("refuses a guest hello with %s", async (_label, data, code) => {
		const { hub, transport } = makeHub();
		hub.connect("a");

		await hub.message("a", hello(data));

		expect(transport.of("a")).toEqual([{ action: "PRESENCE-ERROR", data: { code } }]);
	});

	it("refuses a second hello on the same socket", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		await hub.message("a", hello({ name: "Joey", formats: [] }));

		await hub.message("a", hello({ name: "Joey", formats: [] }));

		expect(transport.last("a")).toEqual({
			action: "PRESENCE-ERROR",
			data: { code: "already-joined" },
		});
	});

	it("sends nothing to sockets that never said hello", async () => {
		const { hub, transport } = makeHub();
		hub.connect("ranking-viewer");
		hub.connect("a");

		await hub.message("a", hello({ name: "Joey", formats: [] }));
		await hub.message(
			"a",
			JSON.stringify({ action: "PRESENCE-SET", data: { status: "searching" } }),
		);
		hub.disconnect("a");

		expect(transport.of("ranking-viewer")).toEqual([]);
	});

	it("tells everyone online when a guest changes its formats or status", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		hub.connect("b");
		await hub.message("a", hello({ name: "Joey", formats: [] }));
		await hub.message("b", hello({ name: "Mai", formats: [] }));
		transport.reset();

		await hub.message(
			"a",
			JSON.stringify({ action: "PRESENCE-SET", data: { formats: ["rush"], status: "in-duel" } }),
		);

		const change = {
			action: "PRESENCE-CHANGE",
			data: {
				id: "g:guest-1",
				name: "Joey",
				account: false,
				userId: null,
				formats: ["rush"],
				status: "in-duel",
				muted: false,
			},
		};
		expect(transport.of("a")).toEqual([change]);
		expect(transport.of("b")).toEqual([change]);
	});

	it("ignores the status an account reports, since the server derives it", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		await hub.message("a", hello({ ticket: TICKET, formats: [] }));
		transport.reset();

		await hub.message("a", JSON.stringify({ action: "PRESENCE-SET", data: { status: "in-duel" } }));

		expect(transport.of("a")).toEqual([]);
	});

	it("refuses a change with formats that are not a list or an unknown status", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		await hub.message("a", hello({ name: "Joey", formats: [] }));
		transport.reset();

		await hub.message("a", JSON.stringify({ action: "PRESENCE-SET", data: { formats: "goat" } }));
		await hub.message("a", JSON.stringify({ action: "PRESENCE-SET", data: { status: "away" } }));

		expect(transport.of("a")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "invalid-update" } },
			{ action: "PRESENCE-ERROR", data: { code: "invalid-update" } },
		]);
	});

	it("answers a change before hello with an error", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");

		await hub.message("a", JSON.stringify({ action: "PRESENCE-SET", data: { status: "free" } }));

		expect(transport.of("a")).toEqual([{ action: "PRESENCE-ERROR", data: { code: "not-joined" } }]);
	});

	it("announces a guest leaving when its socket closes", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		hub.connect("b");
		await hub.message("a", hello({ name: "Joey", formats: [] }));
		await hub.message("b", hello({ name: "Mai", formats: [] }));
		transport.reset();

		hub.disconnect("a");

		expect(transport.of("b")).toEqual([{ action: "PRESENCE-LEAVE", data: { id: "g:guest-1" } }]);
	});

	it("keeps an account online until its last tab closes", async () => {
		const { hub, transport } = makeHub();
		hub.connect("tab-1");
		hub.connect("tab-2");
		hub.connect("other");
		await hub.message("other", hello({ name: "Mai", formats: [] }));
		await hub.message("tab-1", hello({ ticket: TICKET, formats: ["edison"] }));
		await hub.message("tab-2", hello({ ticket: TICKET, formats: ["edison"] }));
		transport.reset();

		hub.disconnect("tab-1");
		expect(transport.of("other")).toEqual([]);

		hub.disconnect("tab-2");
		expect(transport.of("other")).toEqual([{ action: "PRESENCE-LEAVE", data: { id: "u:user-1" } }]);
	});

	it("leaves out a socket that closed while its ticket was being checked", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");
		hub.connect("b");
		await hub.message("b", hello({ name: "Mai", formats: [] }));
		transport.reset();

		const pending = hub.message("a", hello({ ticket: TICKET, formats: [] }));
		hub.disconnect("a");
		await pending;

		expect(transport.of("b")).toEqual([]);
	});

	it("announces an account's new status when the server's view of it changes", async () => {
		let status: PresenceStatus = "free";
		const { hub, transport } = makeHub({ statusOf: () => status });
		hub.connect("a");
		await hub.message("a", hello({ ticket: TICKET, formats: [] }));
		transport.reset();

		hub.refreshStatuses();
		expect(transport.of("a")).toEqual([]);

		status = "searching";
		hub.refreshStatuses();
		expect(transport.of("a")).toEqual([
			{
				action: "PRESENCE-CHANGE",
				data: {
					id: "u:user-1",
					name: "Yugi",
					account: true,
					userId: "user-1",
					formats: [],
					status: "searching",
					muted: false,
				},
			},
		]);
	});

	it("ignores malformed messages and actions it does not know", async () => {
		const { hub, transport } = makeHub();
		hub.connect("a");

		await hub.message("a", "not json");
		await hub.message("a", JSON.stringify({ action: "GET-ROOMS" }));
		await hub.message("a", JSON.stringify([1, 2]));

		expect(transport.of("a")).toEqual([]);
		expect(transport.closed).toEqual([]);
	});

	it("closes a socket that sends more than 20 messages in 10 seconds", async () => {
		let now = 0;
		const { hub, transport } = makeHub({ now: () => now });
		hub.connect("a");
		hub.connect("b");

		for (let i = 0; i < 20; i++) {
			await hub.message("a", "{}");
			await hub.message("b", "{}");
		}
		expect(transport.closed).toEqual([]);

		await hub.message("a", "{}");
		expect(transport.closed).toEqual(["a"]);

		now = 10_001;
		await hub.message("b", "{}");
		expect(transport.closed).toEqual(["a"]);
	});
});

const send = (action: string, data: Record<string, unknown> = {}): string =>
	JSON.stringify({ action, data });

describe("PresenceHub challenges", () => {
	/** Two guests online, Joey (g:guest-1 on "a") and Mai (g:guest-2 on "b"). */
	const twoGuests = async (
		joey: Record<string, unknown> = {},
		mai: Record<string, unknown> = {},
		overrides: Parameters<typeof makeHub>[0] = {},
	) => {
		const setup = makeHub(overrides);
		setup.hub.connect("a");
		setup.hub.connect("b");
		await setup.hub.message("a", hello({ name: "Joey", formats: ["goat", "edison"], ...joey }));
		await setup.hub.message("b", hello({ name: "Mai", formats: ["goat", "speed"], ...mai }));
		setup.transport.reset();

		return setup;
	};

	/** Two accounts online, user-1 on "a" and "a2", user-2 on "b". */
	const twoAccounts = async (overrides: Parameters<typeof makeHub>[0] = {}) => {
		const setup = makeHub(overrides);
		for (const socketId of ["a", "a2", "b"]) {
			setup.hub.connect(socketId);
		}
		await setup.hub.message("a", hello({ ticket: TICKET, formats: ["goat", "speed"] }));
		await setup.hub.message("a2", hello({ ticket: TICKET, formats: ["goat", "speed"] }));
		await setup.hub.message("b", hello({ ticket: "user-2", formats: ["goat", "speed"] }));
		setup.transport.reset();

		return setup;
	};

	const challenge = (to: string, format: string) => send("PRESENCE-CHALLENGE", { to, format });
	const answer = (challengeId: string, accept: boolean) =>
		send("PRESENCE-CHALLENGE-ANSWER", { challengeId, accept });
	const closed = (reason: string, cause?: string) => ({
		action: "CHALLENGE-CLOSED",
		data:
			cause === undefined
				? { challengeId: "challenge-1", reason }
				: { challengeId: "challenge-1", reason, cause },
	});

	it("tells the challenger it was sent and the target what it is, casual between guests", async () => {
		const { hub, transport, scheduler } = await twoGuests();

		await hub.message("a", challenge("g:guest-2", "goat"));

		expect(transport.of("a")).toEqual([
			{
				action: "CHALLENGE-SENT",
				data: {
					challengeId: "challenge-1",
					to: "g:guest-2",
					format: "goat",
					ranked: false,
					bestOf: 1,
					expiresInMs: 30_000,
				},
			},
		]);
		expect(transport.of("b")).toEqual([
			{
				action: "CHALLENGE-RECEIVED",
				data: {
					challengeId: "challenge-1",
					from: "g:guest-1",
					format: "goat",
					ranked: false,
					bestOf: 1,
					expiresInMs: 30_000,
				},
			},
		]);
		expect(scheduler.live()).toEqual([30_000]);
	});

	it("makes a challenge between two accounts ranked, on every socket of each, except in Speed Duel", async () => {
		const { hub, transport } = await twoAccounts();

		await hub.message("b", challenge("u:user-1", "goat"));
		const received = {
			action: "CHALLENGE-RECEIVED",
			data: {
				challengeId: "challenge-1",
				from: "u:user-2",
				format: "goat",
				ranked: true,
				bestOf: 1,
				expiresInMs: 30_000,
			},
		};
		expect(transport.of("a")).toEqual([received]);
		expect(transport.of("a2")).toEqual([received]);

		await hub.message("b", send("PRESENCE-CHALLENGE-CANCEL"));
		transport.reset();
		await hub.message("b", challenge("u:user-1", "speed"));

		expect(transport.last("a")).toMatchObject({
			action: "CHALLENGE-RECEIVED",
			data: { format: "speed", ranked: false },
		});
	});

	it("opens a ranked room for two accounts on accept, takes both out of matchmaking and starts both", async () => {
		const { hub, transport, matchmaking, rooms, scheduler } = await twoAccounts();
		await hub.message("b", challenge("u:user-1", "goat"));
		transport.reset();

		await hub.message("a2", answer("challenge-1", true));

		expect(rooms.issue).toHaveBeenCalledWith({
			format: "goat",
			ranked: true,
			bestOf: 1,
			userIds: ["user-2", "user-1"],
		});
		expect(matchmaking.removeUser).toHaveBeenCalledWith("user-2");
		expect(matchmaking.removeUser).toHaveBeenCalledWith("user-1");
		const start = {
			action: "CHALLENGE-START",
			data: {
				challengeId: "challenge-1",
				command: "ch#abcdefgh01234567",
				format: "goat",
				ranked: true,
				bestOf: 1,
			},
		};
		expect(transport.of("a")).toEqual([start]);
		expect(transport.of("a2")).toEqual([start]);
		expect(transport.of("b")).toEqual([start]);
		expect(scheduler.live()).toEqual([]);
	});

	it("opens a casual room with no seat reservation when a guest is involved", async () => {
		const { hub, transport, matchmaking, rooms } = makeHub();
		hub.connect("a");
		hub.connect("b");
		await hub.message("a", hello({ ticket: TICKET, formats: ["edison"] }));
		await hub.message("b", hello({ name: "Mai", formats: ["edison"] }));
		await hub.message("b", challenge("u:user-1", "edison"));
		transport.reset();

		await hub.message("a", answer("challenge-1", true));

		expect(rooms.issue).toHaveBeenCalledWith({
			format: "edison",
			ranked: false,
			bestOf: 1,
			userIds: [],
		});
		expect(matchmaking.removeUser).toHaveBeenCalledTimes(1);
		expect(matchmaking.removeUser).toHaveBeenCalledWith("user-1");
		expect(transport.of("b")).toEqual([
			{
				action: "CHALLENGE-START",
				data: {
					challengeId: "challenge-1",
					command: "ch#abcdefgh01234567",
					format: "edison",
					ranked: false,
					bestOf: 1,
				},
			},
		]);
	});

	it("carries a best of three from the challenge to the room and both players", async () => {
		const { hub, transport, rooms } = await twoGuests();

		await hub.message("a", send("PRESENCE-CHALLENGE", { to: "g:guest-2", format: "goat", bestOf: 3 }));

		expect(transport.last("a")).toMatchObject({ action: "CHALLENGE-SENT", data: { bestOf: 3 } });
		expect(transport.last("b")).toMatchObject({ action: "CHALLENGE-RECEIVED", data: { bestOf: 3 } });

		await hub.message("b", answer("challenge-1", true));

		expect(rooms.issue).toHaveBeenCalledWith(expect.objectContaining({ bestOf: 3 }));
		expect(transport.last("b")).toMatchObject({ action: "CHALLENGE-START", data: { bestOf: 3 } });
	});

	it("refuses a challenge that asks for neither one duel nor a best of three", async () => {
		const { hub, transport } = await twoGuests();

		await hub.message("a", send("PRESENCE-CHALLENGE", { to: "g:guest-2", format: "goat", bestOf: 2 }));

		expect(transport.last("a")).toEqual({ action: "PRESENCE-ERROR", data: { code: "invalid-challenge" } });
		expect(transport.of("b")).toEqual([]);
	});

	it("closes the other open challenges of both players once a challenge starts", async () => {
		const setup = await twoGuests();
		setup.hub.connect("c");
		await setup.hub.message("c", hello({ name: "Kaiba", formats: ["goat"] }));
		await setup.hub.message("a", challenge("g:guest-3", "goat"));
		await setup.hub.message("c", challenge("g:guest-2", "goat"));
		await setup.hub.message("b", challenge("g:guest-1", "goat"));
		setup.transport.reset();

		await setup.hub.message("a", answer("challenge-3", true));

		const failed = (challengeId: string) => ({
			action: "CHALLENGE-CLOSED",
			data: { challengeId, reason: "failed", cause: "in-duel" },
		});
		expect(setup.transport.of("c")).toEqual([failed("challenge-2"), failed("challenge-1")]);
		expect(setup.transport.of("a")).toEqual([
			failed("challenge-1"),
			expect.objectContaining({ action: "CHALLENGE-START" }),
		]);
		expect(setup.transport.of("b")).toEqual([
			failed("challenge-2"),
			expect.objectContaining({ action: "CHALLENGE-START" }),
		]);
		expect(setup.scheduler.live()).toEqual([]);
	});

	it("closes a declined challenge for both and keeps the challenger away from that player for 2 minutes", async () => {
		let now = 0;
		const { hub, transport, rooms } = await twoGuests({}, {}, { now: () => now });
		await hub.message("a", challenge("g:guest-2", "goat"));
		transport.reset();

		await hub.message("b", answer("challenge-1", false));

		expect(transport.of("a")).toEqual([closed("declined")]);
		expect(transport.of("b")).toEqual([closed("declined")]);
		expect(rooms.issue).not.toHaveBeenCalled();

		now = 119_999;
		transport.reset();
		await hub.message("a", challenge("g:guest-2", "goat"));
		expect(transport.of("a")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "challenge-cooldown" } },
		]);
		expect(transport.of("b")).toEqual([]);

		await hub.message("b", challenge("g:guest-1", "goat"));
		expect(transport.last("b")).toMatchObject({ action: "CHALLENGE-SENT" });

		now = 120_000;
		await hub.message("a", challenge("g:guest-2", "goat"));
		expect(transport.last("a")).toMatchObject({ action: "CHALLENGE-SENT" });
	});

	it("expires an unanswered challenge for both after 30 seconds and lets the challenger send another", async () => {
		const { hub, transport, scheduler } = await twoGuests();
		await hub.message("a", challenge("g:guest-2", "goat"));
		transport.reset();

		scheduler.fireAll();

		expect(transport.of("a")).toEqual([closed("expired")]);
		expect(transport.of("b")).toEqual([closed("expired")]);
		await hub.message("b", answer("challenge-1", true));
		expect(transport.last("b")).toEqual({
			action: "PRESENCE-ERROR",
			data: { code: "unknown-challenge" },
		});
		await hub.message("a", challenge("g:guest-2", "goat"));
		expect(transport.last("a")).toMatchObject({ action: "CHALLENGE-SENT" });
	});

	it("lets the challenger cancel its pending challenge", async () => {
		const { hub, transport, scheduler } = await twoGuests();
		await hub.message("a", challenge("g:guest-2", "goat"));
		transport.reset();

		await hub.message("a", send("PRESENCE-CHALLENGE-CANCEL"));

		expect(transport.of("a")).toEqual([closed("cancelled")]);
		expect(transport.of("b")).toEqual([closed("cancelled")]);
		expect(scheduler.live()).toEqual([]);

		await hub.message("a", send("PRESENCE-CHALLENGE-CANCEL"));
		expect(transport.last("a")).toEqual({
			action: "PRESENCE-ERROR",
			data: { code: "unknown-challenge" },
		});
	});

	it("only lets the target answer a challenge", async () => {
		const { hub, transport, rooms } = await twoGuests();
		await hub.message("a", challenge("g:guest-2", "goat"));
		transport.reset();

		await hub.message("a", answer("challenge-1", true));
		await hub.message("b", answer("challenge-9", true));
		await hub.message("b", send("PRESENCE-CHALLENGE-ANSWER", { challengeId: "challenge-1" }));

		expect(transport.of("a")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "unknown-challenge" } },
		]);
		expect(transport.of("b")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "unknown-challenge" } },
			{ action: "PRESENCE-ERROR", data: { code: "invalid-challenge" } },
		]);
		expect(rooms.issue).not.toHaveBeenCalled();
	});

	it.each([
		["a target not in the list", {}, {}, challenge("g:guest-9", "goat"), "unknown-target"],
		["the sender itself", {}, {}, challenge("g:guest-1", "goat"), "self-challenge"],
		[
			"a format the target does not play",
			{},
			{},
			challenge("g:guest-2", "edison"),
			"format-not-shared",
		],
		[
			"a format outside the catalogue",
			{},
			{},
			challenge("g:guest-2", "tengu"),
			"format-not-shared",
		],
		[
			"a target in a duel",
			{},
			{ status: "in-duel" },
			challenge("g:guest-2", "goat"),
			"target-in-duel",
		],
		[
			"a sender in a duel",
			{ status: "in-duel" },
			{},
			challenge("g:guest-2", "goat"),
			"sender-in-duel",
		],
		[
			"a payload without a target",
			{},
			{},
			send("PRESENCE-CHALLENGE", { format: "goat" }),
			"invalid-challenge",
		],
	])("refuses a challenge to %s", async (_label, joey, mai, message, code) => {
		const { hub, transport, scheduler } = await twoGuests(joey, mai);

		await hub.message("a", message);

		expect(transport.of("a")).toEqual([{ action: "PRESENCE-ERROR", data: { code } }]);
		expect(transport.of("b")).toEqual([]);
		expect(scheduler.live()).toEqual([]);
	});

	it("refuses a challenge to an account the server sees in a duel", async () => {
		const { hub, transport } = await twoAccounts({
			statusOf: (userId) => (userId === "user-1" ? "in-duel" : "free"),
		});

		await hub.message("b", challenge("u:user-1", "goat"));

		expect(transport.of("b")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "target-in-duel" } },
		]);
		expect(transport.of("a")).toEqual([]);
	});

	it("refuses a second pending challenge from the same challenger", async () => {
		const setup = await twoGuests();
		setup.hub.connect("c");
		await setup.hub.message("c", hello({ name: "Kaiba", formats: ["goat"] }));
		await setup.hub.message("a", challenge("g:guest-2", "goat"));
		setup.transport.reset();

		await setup.hub.message("a", challenge("g:guest-3", "goat"));

		expect(setup.transport.of("a")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "challenge-pending" } },
		]);
		expect(setup.transport.of("c")).toEqual([]);
	});

	it("refuses challenge messages from a socket that never said hello", async () => {
		const { hub, transport } = await twoGuests();
		hub.connect("x");

		await hub.message("x", challenge("g:guest-2", "goat"));
		await hub.message("x", send("PRESENCE-CHALLENGE-CANCEL"));
		await hub.message("x", answer("challenge-1", true));
		await hub.message("x", send("PRESENCE-MUTE", { muted: true }));

		expect(transport.of("x")).toEqual(
			Array(4).fill({ action: "PRESENCE-ERROR", data: { code: "not-joined" } }),
		);
	});

	it("announces a muted player to everyone and refuses challenges to them until they unmute", async () => {
		const { hub, transport } = await twoGuests();

		await hub.message("b", send("PRESENCE-MUTE", { muted: true }));

		const muted = {
			action: "PRESENCE-CHANGE",
			data: {
				id: "g:guest-2",
				name: "Mai",
				account: false,
				userId: null,
				formats: ["goat", "speed"],
				status: "free",
				muted: true,
			},
		};
		expect(transport.of("a")).toEqual([muted]);
		expect(transport.of("b")).toEqual([muted]);

		transport.reset();
		await hub.message("a", challenge("g:guest-2", "goat"));
		expect(transport.of("a")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "target-muted" } },
		]);

		await hub.message("b", send("PRESENCE-MUTE", { muted: false }));
		await hub.message("a", challenge("g:guest-2", "goat"));
		expect(transport.last("a")).toMatchObject({ action: "CHALLENGE-SENT" });
	});

	it("refuses a mute that is not a boolean", async () => {
		const { hub, transport } = await twoGuests();

		await hub.message("b", send("PRESENCE-MUTE", { muted: "yes" }));

		expect(transport.of("b")).toEqual([
			{ action: "PRESENCE-ERROR", data: { code: "invalid-update" } },
		]);
		expect(transport.of("a")).toEqual([]);
	});

	it("fails the challenge for both when matchmaking already matched one of the accounts", async () => {
		const { hub, transport, matchmaking, rooms } = await twoAccounts({
			isMatched: (userId) => userId === "user-2",
		});
		await hub.message("b", challenge("u:user-1", "goat"));
		transport.reset();

		await hub.message("a", answer("challenge-1", true));

		expect(transport.of("a")).toEqual([closed("failed", "matchmaking")]);
		expect(transport.of("a2")).toEqual([closed("failed", "matchmaking")]);
		expect(transport.of("b")).toEqual([closed("failed", "matchmaking")]);
		expect(matchmaking.removeUser).not.toHaveBeenCalled();
		expect(rooms.issue).not.toHaveBeenCalled();
	});

	it("fails the challenge for both when one of the players is in a duel by the time it is accepted", async () => {
		let status: PresenceStatus = "free";
		const { hub, transport, matchmaking, rooms } = await twoAccounts({
			statusOf: (userId) => (userId === "user-2" ? status : "free"),
		});
		await hub.message("b", challenge("u:user-1", "goat"));
		transport.reset();
		status = "in-duel";

		await hub.message("a", answer("challenge-1", true));

		expect(transport.of("a")).toEqual([closed("failed", "in-duel")]);
		expect(transport.of("b")).toEqual([closed("failed", "in-duel")]);
		expect(matchmaking.removeUser).not.toHaveBeenCalled();
		expect(rooms.issue).not.toHaveBeenCalled();
	});

	it("cancels a challenge whose challenger leaves the list, and fails one whose target leaves", async () => {
		const setup = await twoGuests();
		setup.hub.connect("c");
		await setup.hub.message("c", hello({ name: "Kaiba", formats: ["goat"] }));
		await setup.hub.message("a", challenge("g:guest-2", "goat"));
		await setup.hub.message("c", challenge("g:guest-1", "goat"));
		setup.transport.reset();

		setup.hub.disconnect("a");

		expect(setup.transport.of("b")).toEqual([
			closed("cancelled"),
			{ action: "PRESENCE-LEAVE", data: { id: "g:guest-1" } },
		]);
		expect(setup.transport.of("c")).toEqual([
			{
				action: "CHALLENGE-CLOSED",
				data: { challengeId: "challenge-2", reason: "failed", cause: "left" },
			},
			{ action: "PRESENCE-LEAVE", data: { id: "g:guest-1" } },
		]);
		expect(setup.scheduler.live()).toEqual([]);
	});

	it("keeps an account's challenges while another of its tabs is still open", async () => {
		const { hub, transport, scheduler } = await twoAccounts();
		await hub.message("a", challenge("u:user-2", "goat"));
		transport.reset();

		hub.disconnect("a");

		expect(transport.of("b")).toEqual([]);
		expect(scheduler.live()).toEqual([30_000]);
	});
});
