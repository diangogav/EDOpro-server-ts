import { mock } from "jest-mock-extended";

import { Logger } from "@shared/logger/domain/Logger";
import { HandshakeTicketStore, TicketConsumeResult } from "@shared/ticket/domain/TicketRepository";

import { PresenceStatus } from "../domain/PresenceStatus";
import { PresenceAccounts, PresenceHub, PresenceMessage, PresenceTransport } from "./PresenceHub";

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

const makeHub = (
	overrides: {
		ticket?: TicketConsumeResult;
		username?: string | null;
		banned?: boolean;
		statusOf?: (userId: string) => PresenceStatus;
		now?: () => number;
	} = {},
) => {
	const transport = new FakeTransport();
	const tickets: HandshakeTicketStore = {
		consumeWithStatus: jest
			.fn()
			.mockResolvedValue(overrides.ticket ?? { status: "consumed", userId: "user-1" }),
	};
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
	});

	return { hub, transport, tickets };
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
