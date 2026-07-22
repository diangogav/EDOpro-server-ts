import { YGOProRoom } from "../../room/domain/YGOProRoom";

/** Grace window a matchmaking-created room is allowed to stay empty before it is
 * reaped. Covers the gap between "match decided" and the real WS handshake: a
 * rage-quit before join, ticket expiry between match and join, or a network drop
 * would otherwise leak the pre-created room forever (RoomFinder/DisconnectHandler
 * only reap rooms that had a real socket). */
export const MATCHMAKING_ROOM_JOIN_GRACE_MS = 45_000;

interface TrackedRoom {
	room: YGOProRoom;
	registeredAt: number;
}

export interface MatchmakingRoomReaperDeps {
	now: () => number;
	/** Canonical room teardown. Injected so the reaper stays decoupled from the
	 * concrete FinalizeYGOProRoom path and is deterministically testable. */
	finalize: (room: YGOProRoom) => void;
	/** Grace window before an unjoined room is reaped. Defaults to the constant. */
	graceMs?: number;
}

/**
 * Reaper for matchmaking pre-created rooms that never receive a real client.
 *
 * MatchmakingRoomFactory registers a YGOProRoom in the lobby BEFORE either paired
 * player connects. If no real client ever joins (rage-quit, ticket expiry, network
 * drop), nothing else reaps it — the normal reap paths key off a real socket.
 *
 * On each sweep, any tracked room still empty (playersCount === 0) past the grace
 * window is torn down via the injected finalize (the existing FinalizeYGOProRoom
 * path in production). A room that has since been joined is left alone and dropped
 * from tracking — its own lifecycle now owns teardown.
 */
export class MatchmakingRoomReaper {
	private readonly tracked = new Map<number, TrackedRoom>();
	private readonly graceMs: number;

	constructor(private readonly deps: MatchmakingRoomReaperDeps) {
		this.graceMs = deps.graceMs ?? MATCHMAKING_ROOM_JOIN_GRACE_MS;
	}

	/** Track a matchmaking-created room from the moment it enters the lobby. */
	track(room: YGOProRoom): void {
		this.tracked.set(room.id, { room, registeredAt: this.deps.now() });
	}

	/** Reap every tracked room still empty past the grace window; stop tracking any
	 * room that has been joined (its own lifecycle owns teardown from here). */
	sweep(): void {
		const now = this.deps.now();
		for (const [id, tracked] of this.tracked) {
			if (tracked.room.playersCount > 0) {
				// A real client joined — hand ownership back to the normal lifecycle.
				this.tracked.delete(id);
				continue;
			}
			if (now - tracked.registeredAt <= this.graceMs) continue;

			this.deps.finalize(tracked.room);
			this.tracked.delete(id);
		}
	}

	/** Test/inspection seam: how many rooms are currently tracked. */
	get size(): number {
		return this.tracked.size;
	}
}
