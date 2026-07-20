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

/** v1 supports a single format/queue combination. Kept as constants so the
 * pairing predicate (same format) is explicit rather than magic strings. */
export const SUPPORTED_FORMAT = "tcg" as const;
export const SUPPORTED_QUEUE = "ranked" as const;

export type MatchmakingFormat = typeof SUPPORTED_FORMAT;

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
	/** Set once matched — the exact string the client sends in CTOS_JOIN_GAME { pass }. */
	roomPassword?: string;
	opponentType?: OpponentType;
	opponentName?: string;
	rated?: boolean;
}
