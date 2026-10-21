import { OpponentType } from "./QueueEntry";

/**
 * STOC `MATCHMAKING_STATUS` state values. Mirrors the wire contract's `state`
 * table; the protocol module owns the numeric encoding.
 */
export type MatchmakingStatusState =
	| "searching"
	| "cancelled"
	| "rejected"
	| "replaced"
	| "authenticated";

/**
 * STOC `MATCHMAKING_STATUS` rejection reason values. Mirrors the wire
 * contract's `reason` table (excluding `none`, which only applies to a
 * non-rejected status); the protocol module owns the numeric encoding.
 */
export type RejectionReason =
	| "invalid_ticket"
	| "not_authenticated"
	| "already_authenticated"
	| "unknown_format"
	| "unsupported_mode"
	| "malformed_frame"
	| "rate_limited"
	| "replaced_by_new_connection"
	| "missing_player_info"
	| "banned"
	| "internal_error"
	| "cancel_too_late"
	| "already_queued"
	| "version_mismatch"
	| "unknown_match"
	| "declined"
	| "accept_timeout";

export interface MatchmakingStatusUpdate {
	readonly state: MatchmakingStatusState;
	readonly waitedMs: number;
	readonly reason?: RejectionReason;
}

export interface MatchFoundNotice {
	readonly matchId: string;
	readonly roomId: number;
	/** Join string for the poll leg only; the socket channel ignores it. */
	readonly roomPassword: string;
	readonly opponentType: OpponentType;
	readonly rated: boolean;
	readonly opponentName: string | null;
}

/** A human match awaiting this participant's ACCEPT/DECLINE. */
export interface MatchProposalNotice {
	readonly matchId: string;
	/** Time left, in ms, before an unanswered proposal counts as declined. */
	readonly acceptWithinMs: number;
}

/**
 * Port a `Participant` uses to reach its connection. No `ISocket` in the
 * matchmaking domain — implementations translate these calls into a socket
 * frame or a poll-record mutation.
 */
export interface ParticipantChannel {
	status(update: MatchmakingStatusUpdate): void;
	found(notice: MatchFoundNotice): void;
	/** Only ever called for a participant that opted into the accept step. */
	proposed(notice: MatchProposalNotice): void;
	close(reason: RejectionReason): void;
	isAlive(now: number): boolean;
}
