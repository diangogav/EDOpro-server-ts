import { randomUUID } from "crypto";

import { Logger } from "@shared/logger/domain/Logger";

import { BotFallbackPolicy } from "../domain/BotFallbackPolicy";
import { CompositePairingPolicy } from "../domain/CompositePairingPolicy";
import { DuplicateQueueEntryError } from "../domain/DuplicateQueueEntryError";
import { FifoPairingPolicy } from "../domain/FifoPairingPolicy";
import { Match } from "../domain/Match";
import { MatchHandler } from "../domain/MatchHandler";
import { MatchmakingPool } from "../domain/MatchmakingPool";
import { Participant } from "../domain/Participant";
import { PoolStore } from "../domain/PoolStore";
import {
	CLEANUP_INTERVAL_MS,
	MATCHED_GRACE_MS,
	MatchmakingFormat,
	QueueEntry,
	SUPPORTED_QUEUE,
} from "../domain/QueueEntry";
import { InMemoryPoolStore } from "../infrastructure/InMemoryPoolStore";
import { PollParticipantChannel } from "../infrastructure/PollParticipantChannel";

export { DuplicateQueueEntryError };

export interface RankedRoomHandle {
	/** The exact string a client sends in CTOS_JOIN_GAME { pass } to land in this room. */
	roomPassword: string;
	/** Concrete room id used to invalidate both reservations if the lobby aborts. */
	roomId: number;
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
	/** Creates a ranked (Verified) room for a human pair. The pair's userIds
	 * become the room's seat reservation — only they may enter it. */
	createRankedRoom: (
		format: MatchmakingFormat,
		reservedUserIds: readonly [string, string],
	) => RankedRoomHandle;
	/** Creates a casual (unrated) room for a bot game and returns its id for the
	 * spawn. The human's userId becomes the room's seat reservation. */
	createBotRoom: (format: MatchmakingFormat, reservedUserId: string) => BotRoomHandle;
	/** Fires the windbot join for the given room (fire-and-forget). */
	spawnBot: (roomId: number, format: MatchmakingFormat) => void;
	/** Whether bot fallback is currently possible (windbot initialized + enabled). */
	botAvailable?: () => boolean;
	/** Optional sink for per-entry room-creation failures. Injected so the queue
	 * domain stays free of a concrete logger; the composition root logs. */
	onRoomCreationError?: (error: unknown) => void;
	/**
	 * Overrides how a formed match is turned into a room. Absent by default, in
	 * which case the facade births the room itself via createRankedRoom/
	 * createBotRoom/spawnBot — the exact behavior the HTTP poll leg has always
	 * had. A caller that wants every participant (including future socket
	 * participants) routed through a shared provisioning path injects one here.
	 */
	matchHandler?: MatchHandler;
	/** Optional sink for structured observability events. Absent in tests that
	 * do not care about logging. */
	logger?: Logger;
}

export interface EnqueueInput {
	ticketId: string;
	userId: string;
	format: MatchmakingFormat;
	/** Public name pre-resolved by the caller; omitted/null when unresolvable. */
	displayName?: string | null;
}

export type PollResult =
	| { state: "searching"; waitedMs: number }
	| {
			state: "matched";
			roomPassword: string;
			opponentType: "human" | "bot";
			/** Opponent's public display name; null when unresolved. Never a userId. */
			opponentName: string | null;
			rated: boolean;
	  };

/**
 * `MatchHandler` used when no `matchHandler` is injected: births a room
 * directly from `createRankedRoom`/`createBotRoom`/`spawnBot`, mirroring the
 * queue's pre-pool behavior exactly. A synchronous failure never aborts the
 * pool's sweep — the match's participants are handed back to the pool for a
 * later retry, exactly as the pre-pool queue left them "searching" on error.
 */
class LegacyRoomMatchHandler implements MatchHandler {
	constructor(
		private readonly deps: Pick<
			MatchmakingQueueDeps,
			"createRankedRoom" | "createBotRoom" | "spawnBot" | "onRoomCreationError"
		>,
		private readonly requeue: (participant: Participant) => void,
	) {}

	handle(match: Match): void {
		try {
			if (match.opponentKind === "bot") {
				this.handleBotMatch(match);
			} else {
				this.handleHumanMatch(match);
			}
		} catch (error) {
			this.deps.onRoomCreationError?.(error);
			for (const participant of match.participants) {
				this.requeue(participant);
			}
		}
	}

	private handleHumanMatch(match: Match): void {
		const [a, b] = match.participants;
		const { roomId, roomPassword } = this.deps.createRankedRoom(match.format, [a.userId, b.userId]);

		a.channel.found({
			matchId: match.id,
			roomId,
			roomPassword,
			opponentType: "human",
			rated: true,
			opponentName: b.displayName,
		});
		b.channel.found({
			matchId: match.id,
			roomId,
			roomPassword,
			opponentType: "human",
			rated: true,
			opponentName: a.displayName,
		});
	}

	private handleBotMatch(match: Match): void {
		const [participant] = match.participants;
		const { roomId, roomPassword } = this.deps.createBotRoom(match.format, participant.userId);

		participant.channel.found({
			matchId: match.id,
			roomId,
			roomPassword,
			opponentType: "bot",
			rated: false,
			opponentName: null,
		});
		this.deps.spawnBot(roomId, match.format);
	}
}

/**
 * MatchmakingQueue — HTTP-facing facade over the shared matchmaking pool.
 *
 * Keeps its pre-pool public surface (enqueue/poll/cancel/abortRoom/
 * isUserQueued/get/init/getInstance/isInitialized/resetForTests/start/stop)
 * plus `dequeueBySocketId` so the three `/api/matchmaking/*` controllers stay
 * untouched. Internally, every poll participant is enqueued into a
 * `MatchmakingPool` (store + FIFO/bot-fallback pairing) through a
 * `PollParticipantChannel` bound to the facade's own `QueueEntry` record —
 * `found()` mutates that record directly, so the facade's bookkeeping stays
 * in sync with the pool for free. The facade still owns `records`/
 * `usersInQueue` on top of the pool's own store because HTTP polling needs a
 * matched entry to survive the pool's removal-on-match for the
 * `MATCHED_GRACE_MS` window (idempotent re-polls) and the pre-enqueue
 * duplicate-user guard.
 */
export class MatchmakingQueue {
	private readonly records = new Map<string, QueueEntry>();
	private readonly usersInQueue = new Map<string, string>(); // userId -> ticketId
	private readonly store: PoolStore = new InMemoryPoolStore();
	private readonly pool: MatchmakingPool;
	private interval: NodeJS.Timeout | null = null;

	private constructor(private readonly deps: MatchmakingQueueDeps) {
		const newMatchId = () => randomUUID();
		const botAvailable = () => this.deps.botAvailable?.() ?? true;
		const pairingPolicy = new CompositePairingPolicy([
			new FifoPairingPolicy(newMatchId),
			new BotFallbackPolicy(botAvailable, newMatchId),
		]);
		const matchHandler: MatchHandler =
			deps.matchHandler ??
			new LegacyRoomMatchHandler(deps, (participant) => this.pool.add(participant));

		this.pool = new MatchmakingPool({
			store: this.store,
			pairingPolicy,
			matchHandler,
			now: deps.now,
		});
	}

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
		if (this.usersInQueue.has(input.userId)) {
			throw new DuplicateQueueEntryError(input.userId);
		}

		const now = this.deps.now();
		const record: QueueEntry = {
			ticketId: input.ticketId,
			userId: input.userId,
			format: input.format,
			displayName: input.displayName ?? null,
			enteredAt: now,
			lastPollAt: now,
			state: "searching",
		};

		const participant: Participant = {
			id: input.ticketId,
			userId: input.userId,
			format: input.format,
			mode: SUPPORTED_QUEUE,
			displayName: record.displayName,
			enqueuedAt: now,
			presence: "poll",
			channel: new PollParticipantChannel(record, this.deps.now),
		};

		// May throw DuplicateQueueEntryError for a cross-presence collision (a
		// socket participant already owns this userId in the pool); nothing is
		// committed to the facade's own bookkeeping in that case.
		this.pool.add(participant);

		this.records.set(input.ticketId, record);
		this.usersInQueue.set(input.userId, input.ticketId);
		this.deps.logger?.info("matchmaking.enter", {
			userId: input.userId,
			format: input.format,
			mode: SUPPORTED_QUEUE,
			presence: "poll",
		});

		// Opportunistic pairing so a waiting partner is matched without waiting a full tick.
		this.tick();
		return record;
	}

	/**
	 * Pure read + heartbeat: refreshes lastPollAt and reports the entry's state.
	 * Pairing, bot fallback, and expiry run only inside tick() — driven by the
	 * interval sweep and opportunistically by enqueue — so a poll storm can never
	 * amplify into O(polls) sweeps or room-creation side effects.
	 */
	poll(ticketId: string): PollResult | null {
		const record = this.records.get(ticketId);
		if (!record) {
			return null;
		}

		record.lastPollAt = this.deps.now();

		if (record.state === "matched") {
			return {
				state: "matched",
				roomPassword: record.roomPassword as string,
				opponentType: record.opponentType as "human" | "bot",
				opponentName: record.opponentName ?? null,
				rated: record.rated as boolean,
			};
		}

		return { state: "searching", waitedMs: this.deps.now() - record.enteredAt };
	}

	cancel(ticketId: string): boolean {
		const record = this.records.get(ticketId);
		if (!record) {
			return false;
		}
		this.pool.remove(ticketId);
		this.removeRecord(record);
		return true;
	}

	/**
	 * Release every matched reservation owned by an incomplete room.
	 *
	 * The room lifecycle calls this before finalizing a matchmaking lobby. Both
	 * users are freed together so the connected survivor can immediately obtain
	 * a fresh ticket and re-enter the pool instead of receiving HTTP 409.
	 */
	abortRoom(roomId: number): number {
		let removed = 0;
		for (const record of [...this.records.values()]) {
			if (record.roomId !== roomId) continue;
			this.pool.remove(record.ticketId);
			this.removeRecord(record);
			removed += 1;
		}
		return removed;
	}

	/**
	 * Synchronous membership check so callers can refuse a duplicate before
	 * paying for async work (ticket already consumed, display-name lookup not
	 * yet started). enqueue() keeps the authoritative atomic guard.
	 */
	isUserQueued(userId: string): boolean {
		return this.usersInQueue.has(userId);
	}

	get(ticketId: string): QueueEntry | undefined {
		return this.records.get(ticketId);
	}

	/** No-op (returns `false`) when the id has no live pool participant (e.g. a poll-only ticket). */
	dequeueBySocketId(socketId: string): boolean {
		return this.pool.dequeueBySocketId(socketId);
	}

	/**
	 * Exposes the shared pool so socket-native collaborators (`EnterMatchmaking`,
	 * `CancelMatchmaking`, `ProvisionMatchRoom`'s re-queue port) enqueue/dequeue
	 * through the exact same store and pairing pipeline poll participants use —
	 * one pool, two presences (D11).
	 */
	getPool(): MatchmakingPool {
		return this.pool;
	}

	// ---- the pairing/expiry engine ----

	tick(): void {
		this.pool.tick();
		this.reconcile(this.deps.now());
	}

	/**
	 * Keeps the facade's own bookkeeping in sync with the pool after a tick:
	 * a `searching` record whose participant the pool's TTL sweep dropped is
	 * freed here (the pool never learns about `records`/`usersInQueue`), and a
	 * `matched` record is freed once MATCHED_GRACE_MS elapses since its last
	 * poll — the pool already removed it from its own store the instant it
	 * matched, so this grace window is bookkeeping the facade alone owns.
	 */
	private reconcile(now: number): void {
		for (const record of this.records.values()) {
			if (record.state === "searching") {
				if (!this.store.get(record.ticketId)) {
					this.records.delete(record.ticketId);
					this.usersInQueue.delete(record.userId);
				}
				continue;
			}

			if (now - record.lastPollAt > MATCHED_GRACE_MS) {
				this.records.delete(record.ticketId);
				this.usersInQueue.delete(record.userId);
			}
		}
	}

	private removeRecord(record: QueueEntry): void {
		this.records.delete(record.ticketId);
		this.usersInQueue.delete(record.userId);
	}
}
