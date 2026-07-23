import {
	BOT_FALLBACK_MS,
	CLEANUP_INTERVAL_MS,
	MATCHED_GRACE_MS,
	MatchmakingFormat,
	QUEUE_TTL_MS,
	QueueEntry,
} from "./QueueEntry";

export interface RankedRoomHandle {
	/** The exact string a client sends in CTOS_JOIN_GAME { pass } to land in this room. */
	roomPassword: string;
}

export interface BotRoomHandle extends RankedRoomHandle {
	roomId: number;
}

/**
 * Ports the queue depends on. Injected so the pairing/TTL logic stays pure and
 * deterministically testable, decoupled from YGOProRoom, windbot, and the clock.
 */
export interface MatchmakingQueueDeps {
	now: () => number;
	/** Creates a ranked (Verified) room for a human pair. */
	createRankedRoom: (format: MatchmakingFormat) => RankedRoomHandle;
	/** Creates a casual (unrated) room for a bot game and returns its id for the spawn. */
	createBotRoom: (format: MatchmakingFormat) => BotRoomHandle;
	/** Fires the windbot join for the given room (fire-and-forget). */
	spawnBot: (roomId: number, format: MatchmakingFormat) => void;
	/** Whether bot fallback is currently possible (windbot initialized + enabled). */
	botAvailable?: () => boolean;
	/** Optional sink for per-entry room-creation failures. Injected so the queue
	 * domain stays free of a concrete logger; the composition root logs. */
	onRoomCreationError?: (error: unknown) => void;
}

export interface EnqueueInput {
	ticketId: string;
	userId: string;
	format: MatchmakingFormat;
}

export type PollResult =
	| { state: "searching"; waitedMs: number }
	| {
			state: "matched";
			roomPassword: string;
			opponentType: "human" | "bot";
			opponentName?: string;
			rated: boolean;
	  };

export class DuplicateQueueEntryError extends Error {
	constructor(userId: string) {
		super(`User ${userId} already has an active matchmaking entry`);
		this.name = "DuplicateQueueEntryError";
	}
}

/**
 * MatchmakingQueue — in-memory auto-pairing queue for the duel server.
 *
 * Node's single thread means synchronous Map operations need no locking: enqueue,
 * poll, cancel, and every tick run to completion without interleaving. All async
 * work (room creation side effects, windbot HTTP) is delegated to injected ports
 * and, for the bot spawn, fired-and-forgotten.
 *
 * The tick (run on an unref'd interval AND opportunistically on enqueue/poll):
 *   1. TTL sweep: drop searching entries whose last poll fell outside QUEUE_TTL_MS.
 *   2. Pair: two searching entries of the same format → one ranked room, both matched.
 *   3. Bot fallback: a searching entry older than BOT_FALLBACK_MS with no human → bot room.
 */
export class MatchmakingQueue {
	private readonly entries = new Map<string, QueueEntry>();
	private readonly usersInQueue = new Map<string, string>(); // userId -> ticketId
	private interval: NodeJS.Timeout | null = null;

	private constructor(private readonly deps: MatchmakingQueueDeps) {}

	// ---- singleton accessor (mirrors WindbotModule / YGOProRoomList pattern) ----

	private static _instance: MatchmakingQueue | null = null;

	static init(deps: MatchmakingQueueDeps): void {
		MatchmakingQueue._instance = new MatchmakingQueue(deps);
	}

	static getInstance(): MatchmakingQueue {
		if (!MatchmakingQueue._instance) {
			throw new Error("MatchmakingQueue not initialized — call MatchmakingQueue.init() first");
		}
		return MatchmakingQueue._instance;
	}

	static isInitialized(): boolean {
		return MatchmakingQueue._instance !== null;
	}

	/** Test seam: build an instance with injected deps without touching the singleton. */
	static createForTests(deps: MatchmakingQueueDeps): MatchmakingQueue {
		return new MatchmakingQueue(deps);
	}

	/** Test seam: reset the singleton so suites can call init() cleanly. */
	static resetForTests(): void {
		if (MatchmakingQueue._instance) {
			MatchmakingQueue._instance.stop();
		}
		MatchmakingQueue._instance = null;
	}

	// ---- lifecycle ----

	start(): void {
		if (this.interval) return;
		// unref() so the interval never keeps the process (or a test run) alive.
		this.interval = setInterval(() => this.tick(), CLEANUP_INTERVAL_MS);
		this.interval.unref();
	}

	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	// ---- public API ----

	enqueue(input: EnqueueInput): QueueEntry {
		const existingTicket = this.usersInQueue.get(input.userId);
		if (existingTicket !== undefined) {
			throw new DuplicateQueueEntryError(input.userId);
		}

		const now = this.deps.now();
		const entry: QueueEntry = {
			ticketId: input.ticketId,
			userId: input.userId,
			format: input.format,
			enteredAt: now,
			lastPollAt: now,
			state: "searching",
		};
		this.entries.set(input.ticketId, entry);
		this.usersInQueue.set(input.userId, input.ticketId);

		// Opportunistic pairing so a waiting partner is matched without waiting a full tick.
		this.tick();
		return entry;
	}

	poll(ticketId: string): PollResult | null {
		const entry = this.entries.get(ticketId);
		if (!entry) {
			return null;
		}

		entry.lastPollAt = this.deps.now();

		if (entry.state === "matched") {
			return {
				state: "matched",
				roomPassword: entry.roomPassword as string,
				opponentType: entry.opponentType as "human" | "bot",
				opponentName: entry.opponentName,
				rated: entry.rated as boolean,
			};
		}

		// Advance the queue on the poll too — the poll is the client's heartbeat.
		this.tick();

		const refreshed = this.entries.get(ticketId);
		if (refreshed && refreshed.state === "matched") {
			return {
				state: "matched",
				roomPassword: refreshed.roomPassword as string,
				opponentType: refreshed.opponentType as "human" | "bot",
				opponentName: refreshed.opponentName,
				rated: refreshed.rated as boolean,
			};
		}

		return { state: "searching", waitedMs: this.deps.now() - entry.enteredAt };
	}

	cancel(ticketId: string): boolean {
		const entry = this.entries.get(ticketId);
		if (!entry) {
			return false;
		}
		this.entries.delete(ticketId);
		this.usersInQueue.delete(entry.userId);
		return true;
	}

	get(ticketId: string): QueueEntry | undefined {
		return this.entries.get(ticketId);
	}

	// ---- the pairing/expiry engine ----

	tick(): void {
		const now = this.deps.now();
		this.expireStale(now);
		this.pairHumans();
		this.botFallback(now);
	}

	private expireStale(now: number): void {
		for (const entry of this.entries.values()) {
			// Searching entries that fell behind the poll heartbeat are dropped.
			if (entry.state === "searching" && now - entry.lastPollAt > QUEUE_TTL_MS) {
				this.entries.delete(entry.ticketId);
				this.usersInQueue.delete(entry.userId);
				continue;
			}

			// Matched entries are retained for a grace window so a re-poll still gets
			// the `matched` result (idempotency), then reaped to free the user — even
			// if the client never polled the final result. This only cleans up the
			// QUEUE entry; the created room is reaped separately by MatchmakingRoomReaper.
			//
			// The grace is measured from lastPollAt (refreshed on every poll, including
			// polls of matched entries), NOT matchedAt: an actively-polling client (e.g.
			// a slow join) is never dropped mid-flow, while a client that stopped polling
			// (already joined) expires MATCHED_GRACE_MS after its last contact.
			if (entry.state === "matched" && now - entry.lastPollAt > MATCHED_GRACE_MS) {
				this.entries.delete(entry.ticketId);
				this.usersInQueue.delete(entry.userId);
			}
		}
	}

	private pairHumans(): void {
		// Pair by format. Insertion order (Map iteration) gives FIFO fairness.
		const byFormat = new Map<MatchmakingFormat, QueueEntry[]>();
		for (const entry of this.entries.values()) {
			if (entry.state !== "searching") continue;
			const bucket = byFormat.get(entry.format) ?? [];
			bucket.push(entry);
			byFormat.set(entry.format, bucket);
		}

		for (const bucket of byFormat.values()) {
			for (let i = 0; i + 1 < bucket.length; i += 2) {
				const a = bucket[i];
				const b = bucket[i + 1];
				// A synchronous throw from the room-creation port must not abort the
				// whole sweep or bubble a 500 to an unrelated enqueue/poll caller.
				// On failure, leave BOTH entries searching (a retry next tick, or a
				// bot fallback / TTL drop, will resolve them) and move on.
				try {
					const { roomPassword } = this.deps.createRankedRoom(a.format);
					this.markMatched(a, roomPassword, "human", true, b.userId);
					this.markMatched(b, roomPassword, "human", true, a.userId);
				} catch (error) {
					this.deps.onRoomCreationError?.(error);
				}
			}
		}
	}

	private botFallback(now: number): void {
		const botAvailable = this.deps.botAvailable?.() ?? true;
		if (!botAvailable) {
			// Graceful degradation: leave entries searching (a human may still arrive,
			// or the TTL sweep drops them) rather than crashing or erroring the poll.
			return;
		}

		for (const entry of this.entries.values()) {
			if (entry.state !== "searching") continue;
			if (now - entry.enteredAt <= BOT_FALLBACK_MS) continue;

			// A synchronous throw from createBotRoom/spawnBot must not abort the sweep
			// or 500 an unrelated caller. On failure, leave THIS entry searching (a
			// later tick retries, or the TTL sweep drops it) and continue with the rest.
			try {
				const { roomPassword, roomId } = this.deps.createBotRoom(entry.format);
				this.markMatched(entry, roomPassword, "bot", false);
				this.deps.spawnBot(roomId, entry.format);
			} catch (error) {
				this.deps.onRoomCreationError?.(error);
			}
		}
	}

	private markMatched(
		entry: QueueEntry,
		roomPassword: string,
		opponentType: "human" | "bot",
		rated: boolean,
		opponentName?: string,
	): void {
		entry.state = "matched";
		entry.matchedAt = this.deps.now();
		entry.roomPassword = roomPassword;
		entry.opponentType = opponentType;
		entry.rated = rated;
		entry.opponentName = opponentName;
	}
}
