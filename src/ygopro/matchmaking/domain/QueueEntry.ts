/**
 * Matchmaking queue tunables. Mirrors the values in the shared contract
 * (evolution-card-game/docs/architecture/matchmaking-contract.md):
 *  - the client short-polls status every ~2s; that poll doubles as the heartbeat.
 *  - a ticket that misses the poll window is dropped (TTL).
 *  - a ticket with no human match within the bot-fallback window gets a bot game.
 */
export const QUEUE_TTL_MS = 8_000;
export const BOT_FALLBACK_MS = 15_000;
export const CLEANUP_INTERVAL_MS = 2_000;
/**
 * Grace window a matched entry is retained after pairing. Within it, a client
 * that re-polls still gets its `matched` result (idempotency); once it elapses
 * the sweep drops the entry and frees the user so they can queue again — even if
 * the client never polled the final result. This only reaps the QUEUE bookkeeping;
 * the created room is owned/reaped separately by MatchmakingRoomReaper.
 */
export const MATCHED_GRACE_MS = 30_000;

/** All accepted matchmaking formats. Used as the single source of truth for the
 * Zod enum, type derivation, and per-format record maps. */
export const MATCHMAKING_FORMATS = ["tcg", "jtp"] as const;
export const SUPPORTED_QUEUE = "ranked" as const;

export type MatchmakingFormat = (typeof MATCHMAKING_FORMATS)[number];

export type OpponentType = "human" | "bot";

/**
 * A ticket's lifecycle state. `searching` entries are candidates for pairing
 * and bot fallback; `matched` entries carry the join password the client needs.
 */
export type QueueEntryState = "searching" | "matched";

export interface QueueEntry {
	readonly ticketId: string;
	/** Identity resolved from the auth ticket. Enforces one active entry per user. */
	readonly userId: string;
	readonly format: MatchmakingFormat;
	readonly enteredAt: number;
	/** Refreshed on every status poll; the TTL sweep drops entries that fall behind. */
	lastPollAt: number;
	state: QueueEntryState;
	/** Set when the entry transitions to `matched`; drives the grace-window sweep
	 * that frees the user (MATCHED_GRACE_MS) regardless of client polling. */
	matchedAt?: number;
	/** Set once matched — the exact string the client sends in CTOS_JOIN_GAME { pass }. */
	roomPassword?: string;
	/** Server room owning this reservation. Used to release both users atomically
	 * when an incomplete matchmaking lobby is aborted. */
	roomId?: number;
	opponentType?: OpponentType;
	opponentName?: string;
	rated?: boolean;
}
