import { Team } from "@shared/room/Team";

/**
 * One participant as exposed to a match lifecycle hook. Shape mirrors the
 * shared rating-eligibility gate's player type so a hook can pass
 * `MatchContext.players` straight into it without a mapping step. `winner`
 * is only meaningful on the ending context — a starting context still fills
 * it (`false`) so the type stays uniform.
 */
export interface MatchContextPlayer {
	readonly id: string | null;
	readonly team: Team;
	readonly name: string;
	readonly winner: boolean;
}

/**
 * Read-only view of a match handed to lifecycle hooks. Hooks never see the
 * room, a socket, or a client — `announce` is the only way a hook can reach
 * the room's clients, and it only ever sends a system chat line.
 *
 * `matchId` identifies the match aggregate itself (the same identity
 * `GameOverDomainEvent.matchId` carries), distinct from `roomId`: a room's
 * numeric id is small and gets reused across unrelated matches once freed,
 * while `matchId` never repeats. A hook that keeps per-match state must key
 * it by `matchId`, not `roomId`.
 */
export interface MatchContext {
	readonly roomId: number;
	readonly matchId: string;
	readonly ranked: boolean;
	readonly banListName: string;
	readonly season: number;
	readonly players: readonly MatchContextPlayer[];
	announce(message: string): void;
}

/**
 * Identifies a room that has just been torn down, for hooks that need to
 * release per-match state at that point rather than only on a clean match
 * end.
 */
export interface RoomClosedContext {
	readonly roomId: number;
	readonly matchId: string;
}

/**
 * Contract for a match lifecycle subscriber. Implementers register through
 * a plugin's `lifecycleHooks` field (see ServerPlugin) and are driven by the
 * `MatchLifecycleHooks` runner, which isolates one hook's failure from the
 * rest and bounds how long `onMatchEnding` may block match teardown.
 */
export interface MatchLifecycleHook {
	readonly name: string;
	onMatchStarted?(ctx: MatchContext): Promise<void>;
	onMatchEnding?(ctx: MatchContext): Promise<void>;
	onRoomClosed?(ctx: RoomClosedContext): Promise<void>;
}
