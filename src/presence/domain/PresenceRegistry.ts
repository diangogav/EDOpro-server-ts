import { PresenceFormat } from "./PresenceFormat";
import { PresenceStatus } from "./PresenceStatus";

export type PresenceIdentity =
	| { readonly kind: "account"; readonly userId: string; readonly name: string }
	| { readonly kind: "guest"; readonly guestId: string; readonly name: string };

/** One player as every online client sees them. */
export interface PresencePlayer {
	readonly id: string;
	readonly name: string;
	readonly account: boolean;
	readonly userId: string | null;
	readonly formats: readonly PresenceFormat[];
	readonly status: PresenceStatus;
	/** Whether the player turned challenges off; they stay in the list. */
	readonly muted: boolean;
}

export type JoinResult =
	| { readonly kind: "joined"; readonly player: PresencePlayer }
	| { readonly kind: "changed"; readonly player: PresencePlayer }
	| { readonly kind: "unchanged"; readonly player: PresencePlayer };

interface Entry {
	player: PresencePlayer;
	readonly sockets: Set<string>;
}

/**
 * Who is online. An account is one entry however many tabs it has open, and
 * it leaves the list when its last socket closes; a guest is one entry per
 * socket.
 */
export class PresenceRegistry {
	private readonly entries = new Map<string, Entry>();
	private readonly entryIdBySocket = new Map<string, string>();

	public join(
		socketId: string,
		identity: PresenceIdentity,
		formats: readonly PresenceFormat[],
		status: PresenceStatus,
	): JoinResult {
		const id = PresenceRegistry.entryId(identity);
		const existing = this.entries.get(id);
		this.entryIdBySocket.set(socketId, id);

		if (existing) {
			existing.sockets.add(socketId);
			const player = { ...existing.player, name: identity.name, formats: [...formats] };
			if (PresenceRegistry.sameView(existing.player, player)) {
				return { kind: "unchanged", player: existing.player };
			}
			existing.player = player;

			return { kind: "changed", player };
		}

		const player: PresencePlayer = {
			id,
			name: identity.name,
			account: identity.kind === "account",
			userId: identity.kind === "account" ? identity.userId : null,
			formats: [...formats],
			status,
			muted: false,
		};
		this.entries.set(id, { player, sockets: new Set([socketId]) });

		return { kind: "joined", player };
	}

	/** Removes a socket; returns the player when it was their last one. */
	public leave(socketId: string): PresencePlayer | null {
		const id = this.entryIdBySocket.get(socketId);
		if (id === undefined) {
			return null;
		}
		this.entryIdBySocket.delete(socketId);
		const entry = this.entries.get(id);
		if (!entry) {
			return null;
		}
		entry.sockets.delete(socketId);
		if (entry.sockets.size > 0) {
			return null;
		}
		this.entries.delete(id);

		return entry.player;
	}

	public isJoined(socketId: string): boolean {
		return this.entryIdBySocket.has(socketId);
	}

	public playerOf(socketId: string): PresencePlayer | null {
		const id = this.entryIdBySocket.get(socketId);

		return id === undefined ? null : (this.entries.get(id)?.player ?? null);
	}

	public find(id: string): PresencePlayer | null {
		return this.entries.get(id)?.player ?? null;
	}

	/** Every open socket of a player; empty when the player is not online. */
	public socketIdsOf(id: string): string[] {
		return [...(this.entries.get(id)?.sockets ?? [])];
	}

	/** Changes a player's formats, status and/or mute; returns the player when anything changed. */
	public update(
		id: string,
		change: {
			readonly formats?: readonly PresenceFormat[];
			readonly status?: PresenceStatus;
			readonly muted?: boolean;
		},
	): PresencePlayer | null {
		const entry = this.entries.get(id);
		if (!entry) {
			return null;
		}
		const player: PresencePlayer = {
			...entry.player,
			formats: change.formats ? [...change.formats] : entry.player.formats,
			status: change.status ?? entry.player.status,
			muted: change.muted ?? entry.player.muted,
		};
		if (PresenceRegistry.sameView(entry.player, player)) {
			return null;
		}
		entry.player = player;

		return player;
	}

	public players(): PresencePlayer[] {
		return [...this.entries.values()].map((entry) => entry.player);
	}

	public socketIds(): string[] {
		return [...this.entryIdBySocket.keys()];
	}

	private static entryId(identity: PresenceIdentity): string {
		return identity.kind === "account" ? `u:${identity.userId}` : `g:${identity.guestId}`;
	}

	private static sameView(a: PresencePlayer, b: PresencePlayer): boolean {
		return (
			a.name === b.name &&
			a.status === b.status &&
			a.muted === b.muted &&
			a.formats.length === b.formats.length &&
			a.formats.every((format, index) => b.formats[index] === format)
		);
	}
}
