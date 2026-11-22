import { Logger } from "@shared/logger/domain/Logger";
import { HandshakeTicketStore } from "@shared/ticket/domain/TicketRepository";

import { normalizeGuestName } from "../domain/GuestName";
import { PresenceFormat, parsePresenceFormats } from "../domain/PresenceFormat";
import {
	JoinResult,
	PresenceIdentity,
	PresencePlayer,
	PresenceRegistry,
} from "../domain/PresenceRegistry";
import { isPresenceStatus, PresenceStatus } from "../domain/PresenceStatus";

export type PresenceErrorCode =
	| "invalid-hello"
	| "invalid-name"
	| "invalid-ticket"
	| "auth-unavailable"
	| "banned"
	| "already-joined"
	| "not-joined";

export type PresenceMessage =
	| { action: "PRESENCE-WELCOME"; data: { self: string; players: PresencePlayer[] } }
	| { action: "PRESENCE-JOIN"; data: PresencePlayer }
	| { action: "PRESENCE-CHANGE"; data: PresencePlayer }
	| { action: "PRESENCE-LEAVE"; data: { id: string } }
	| { action: "PRESENCE-ERROR"; data: { code: PresenceErrorCode } };

/** Delivers presence messages to one socket of the room-list WebSocket. */
export interface PresenceTransport {
	send(socketId: string, message: PresenceMessage): void;
	close(socketId: string): void;
}

export interface PresenceAccounts {
	findUsername(userId: string): Promise<string | null>;
	isBanned(userId: string): Promise<boolean>;
}

/** What the server itself knows about an account: queued, seated in a running duel, or neither. */
export interface AccountStatusProbe {
	statusOf(userId: string): PresenceStatus;
}

export interface PresenceHubDeps {
	transport: PresenceTransport;
	tickets: HandshakeTicketStore;
	accounts: PresenceAccounts;
	statusProbe: AccountStatusProbe;
	logger: Logger;
	newGuestId: () => string;
	now: () => number;
}

export const PRESENCE_RATE_LIMIT = { messages: 20, windowMs: 10_000 } as const;

interface RateWindow {
	startedAt: number;
	count: number;
}

type Hello = {
	ticket: string | null;
	name: unknown;
	formats: PresenceFormat[];
	status: PresenceStatus;
};

/**
 * The online list over the room-list WebSocket. A socket stays anonymous (it
 * only gets the room broadcasts) until it sends `PRESENCE-HELLO`; from then on
 * it is in the list and receives every presence change.
 */
export class PresenceHub {
	private readonly registry = new PresenceRegistry();
	private readonly connected = new Set<string>();
	private readonly helloInFlight = new Set<string>();
	private readonly rates = new Map<string, RateWindow>();

	public constructor(private readonly deps: PresenceHubDeps) {}

	public connect(socketId: string): void {
		this.connected.add(socketId);
	}

	public disconnect(socketId: string): void {
		this.connected.delete(socketId);
		this.helloInFlight.delete(socketId);
		this.rates.delete(socketId);
		const left = this.registry.leave(socketId);
		if (left) {
			this.broadcast({ action: "PRESENCE-LEAVE", data: { id: left.id } });
		}
	}

	public async message(socketId: string, raw: string): Promise<void> {
		if (!this.withinRate(socketId)) {
			this.deps.transport.close(socketId);

			return;
		}
		const parsed = PresenceHub.parse(raw);
		if (!parsed) {
			return;
		}
		if (parsed.action === "PRESENCE-HELLO") {
			await this.hello(socketId, parsed.data);
		} else if (parsed.action === "PRESENCE-SET") {
			this.set(socketId, parsed.data);
		}
	}

	/** Re-reads every account's status from the server's own state and announces the ones that changed. */
	public refreshStatuses(): void {
		for (const player of this.registry.players()) {
			if (player.userId === null) {
				continue;
			}
			const changed = this.registry.update(player.id, {
				status: this.deps.statusProbe.statusOf(player.userId),
			});
			if (changed) {
				this.broadcast({ action: "PRESENCE-CHANGE", data: changed });
			}
		}
	}

	private async hello(socketId: string, data: Record<string, unknown>): Promise<void> {
		if (this.registry.isJoined(socketId) || this.helloInFlight.has(socketId)) {
			this.error(socketId, "already-joined");

			return;
		}
		const hello = PresenceHub.parseHello(data);
		if (!hello) {
			this.error(socketId, "invalid-hello");

			return;
		}

		this.helloInFlight.add(socketId);
		try {
			const identity = await this.identify(socketId, hello);
			if (!identity || !this.connected.has(socketId)) {
				return;
			}
			const status =
				identity.kind === "account"
					? this.deps.statusProbe.statusOf(identity.userId)
					: hello.status;
			const result = this.registry.join(socketId, identity, hello.formats, status);
			this.deps.transport.send(socketId, {
				action: "PRESENCE-WELCOME",
				data: { self: result.player.id, players: this.registry.players() },
			});
			this.announceJoin(socketId, result);
		} finally {
			this.helloInFlight.delete(socketId);
		}
	}

	private async identify(socketId: string, hello: Hello): Promise<PresenceIdentity | null> {
		if (hello.ticket === null) {
			const name = normalizeGuestName(hello.name);
			if (name === null) {
				this.error(socketId, "invalid-name");

				return null;
			}

			return { kind: "guest", guestId: this.deps.newGuestId(), name };
		}

		try {
			const consumed = await this.deps.tickets.consumeWithStatus(hello.ticket);
			if (consumed.status === "unavailable") {
				this.error(socketId, "auth-unavailable");

				return null;
			}
			if (consumed.status === "invalid") {
				this.error(socketId, "invalid-ticket");

				return null;
			}
			const [username, banned] = await Promise.all([
				this.deps.accounts.findUsername(consumed.userId),
				this.deps.accounts.isBanned(consumed.userId),
			]);
			if (banned) {
				this.error(socketId, "banned");

				return null;
			}
			if (username === null) {
				this.error(socketId, "invalid-ticket");

				return null;
			}

			return { kind: "account", userId: consumed.userId, name: username };
		} catch (error) {
			this.deps.logger.warn("Presence account lookup failed", {
				error: error instanceof Error ? error.message : String(error),
			});
			this.error(socketId, "auth-unavailable");

			return null;
		}
	}

	private set(socketId: string, data: Record<string, unknown>): void {
		const player = this.registry.playerOf(socketId);
		if (!player) {
			this.error(socketId, "not-joined");

			return;
		}
		const formats = data.formats === undefined ? undefined : parsePresenceFormats(data.formats);
		const status = player.account || data.status === undefined ? undefined : data.status;
		if (formats === null || (status !== undefined && !isPresenceStatus(status))) {
			this.error(socketId, "invalid-hello");

			return;
		}
		const changed = this.registry.update(player.id, { formats, status });
		if (changed) {
			this.broadcast({ action: "PRESENCE-CHANGE", data: changed });
		}
	}

	private announceJoin(socketId: string, result: JoinResult): void {
		if (result.kind === "joined") {
			this.broadcast({ action: "PRESENCE-JOIN", data: result.player }, socketId);
		} else if (result.kind === "changed") {
			this.broadcast({ action: "PRESENCE-CHANGE", data: result.player });
		}
	}

	private broadcast(message: PresenceMessage, exceptSocketId?: string): void {
		for (const socketId of this.registry.socketIds()) {
			if (socketId !== exceptSocketId) {
				this.deps.transport.send(socketId, message);
			}
		}
	}

	private error(socketId: string, code: PresenceErrorCode): void {
		this.deps.transport.send(socketId, { action: "PRESENCE-ERROR", data: { code } });
	}

	private withinRate(socketId: string): boolean {
		const now = this.deps.now();
		const window = this.rates.get(socketId);
		if (!window || now - window.startedAt > PRESENCE_RATE_LIMIT.windowMs) {
			this.rates.set(socketId, { startedAt: now, count: 1 });

			return true;
		}
		window.count += 1;

		return window.count <= PRESENCE_RATE_LIMIT.messages;
	}

	private static parse(raw: string): { action: string; data: Record<string, unknown> } | null {
		let value: unknown;
		try {
			value = JSON.parse(raw);
		} catch {
			return null;
		}
		if (typeof value !== "object" || value === null || Array.isArray(value)) {
			return null;
		}
		const { action, data } = value as { action?: unknown; data?: unknown };
		if (typeof action !== "string") {
			return null;
		}
		const payload = typeof data === "object" && data !== null && !Array.isArray(data) ? data : {};

		return { action, data: payload as Record<string, unknown> };
	}

	private static parseHello(data: Record<string, unknown>): Hello | null {
		const formats = parsePresenceFormats(data.formats);
		const status = data.status ?? "free";
		const ticket = data.ticket ?? null;
		if (
			formats === null ||
			!isPresenceStatus(status) ||
			(ticket !== null && typeof ticket !== "string")
		) {
			return null;
		}

		return { ticket, name: data.name, formats, status };
	}
}
