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
import { ChallengeDesk } from "./ChallengeDesk";

export type PresenceErrorCode =
	| "invalid-hello"
	| "invalid-update"
	| "invalid-name"
	| "invalid-ticket"
	| "auth-unavailable"
	| "banned"
	| "already-joined"
	| "not-joined"
	| "invalid-challenge"
	| "unknown-target"
	| "self-challenge"
	| "format-not-shared"
	| "sender-in-duel"
	| "target-in-duel"
	| "target-muted"
	| "challenge-pending"
	| "challenge-cooldown"
	| "unknown-challenge";

export type ChallengeCloseReason = "declined" | "expired" | "cancelled" | "failed";

/** Why a challenge failed: a player left, is in a duel, was matched by matchmaking, or no room could be made. */
export type ChallengeCloseCause = "left" | "in-duel" | "matchmaking" | "unavailable";

export type PresenceMessage =
	| { action: "PRESENCE-WELCOME"; data: { self: string; players: PresencePlayer[] } }
	| { action: "PRESENCE-JOIN"; data: PresencePlayer }
	| { action: "PRESENCE-CHANGE"; data: PresencePlayer }
	| { action: "PRESENCE-LEAVE"; data: { id: string } }
	| { action: "PRESENCE-ERROR"; data: { code: PresenceErrorCode } }
	| {
			action: "CHALLENGE-SENT";
			data: {
				challengeId: string;
				to: string;
				format: PresenceFormat;
				ranked: boolean;
				expiresInMs: number;
			};
	  }
	| {
			action: "CHALLENGE-RECEIVED";
			data: {
				challengeId: string;
				from: string;
				format: PresenceFormat;
				ranked: boolean;
				expiresInMs: number;
			};
	  }
	| {
			action: "CHALLENGE-CLOSED";
			data: { challengeId: string; reason: ChallengeCloseReason; cause?: ChallengeCloseCause };
	  }
	| {
			action: "CHALLENGE-START";
			data: { challengeId: string; command: string; format: PresenceFormat; ranked: boolean };
	  };

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

/** What a challenge needs from matchmaking about the accounts it involves. */
export interface ChallengeMatchmaking {
	/** Whether matchmaking already formed or proposed a match for the account. */
	isMatched(userId: string): boolean;
	/** Takes the account out of the matchmaking queue when it is searching. */
	removeUser(userId: string): void;
}

/** Stores the room of an accepted challenge and returns the code that opens it. */
export interface ChallengeRoomIssuer {
	issue(input: { format: string; ranked: boolean; userIds: readonly string[] }): { code: string };
}

export interface PresenceHubDeps {
	transport: PresenceTransport;
	tickets: HandshakeTicketStore;
	accounts: PresenceAccounts;
	statusProbe: AccountStatusProbe;
	logger: Logger;
	newGuestId: () => string;
	now: () => number;
	matchmaking: ChallengeMatchmaking;
	challengeRooms: ChallengeRoomIssuer;
	/** Runs `callback` after `delayMs`; the returned function cancels it. */
	schedule: (callback: () => void, delayMs: number) => () => void;
	newChallengeId: () => string;
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
	private readonly challenges: ChallengeDesk;

	public constructor(private readonly deps: PresenceHubDeps) {
		this.challenges = new ChallengeDesk({
			registry: this.registry,
			statusProbe: deps.statusProbe,
			matchmaking: deps.matchmaking,
			challengeRooms: deps.challengeRooms,
			schedule: deps.schedule,
			newChallengeId: deps.newChallengeId,
			now: deps.now,
			logger: deps.logger,
			send: (socketId, message) => deps.transport.send(socketId, message),
			error: (socketId, code) => this.error(socketId, code),
		});
	}

	public connect(socketId: string): void {
		this.connected.add(socketId);
	}

	public disconnect(socketId: string): void {
		this.connected.delete(socketId);
		this.helloInFlight.delete(socketId);
		this.rates.delete(socketId);
		const left = this.registry.leave(socketId);
		if (left) {
			this.challenges.playerLeft(left.id);
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
		} else if (parsed.action === "PRESENCE-MUTE") {
			this.mute(socketId, parsed.data);
		} else if (parsed.action === "PRESENCE-CHALLENGE") {
			this.challenges.challenge(socketId, parsed.data);
		} else if (parsed.action === "PRESENCE-CHALLENGE-CANCEL") {
			this.challenges.cancel(socketId);
		} else if (parsed.action === "PRESENCE-CHALLENGE-ANSWER") {
			this.challenges.answer(socketId, parsed.data);
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
			this.error(socketId, "invalid-update");

			return;
		}
		const changed = this.registry.update(player.id, { formats, status });
		if (changed) {
			this.broadcast({ action: "PRESENCE-CHANGE", data: changed });
		}
	}

	/** Turns challenges to the player off or on; they stay in the list either way. */
	private mute(socketId: string, data: Record<string, unknown>): void {
		const player = this.registry.playerOf(socketId);
		if (!player) {
			this.error(socketId, "not-joined");

			return;
		}
		if (typeof data.muted !== "boolean") {
			this.error(socketId, "invalid-update");

			return;
		}
		const changed = this.registry.update(player.id, { muted: data.muted });
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
