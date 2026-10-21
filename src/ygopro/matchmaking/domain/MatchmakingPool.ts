import { Logger } from "@shared/logger/domain/Logger";

import { DuplicateQueueEntryError } from "./DuplicateQueueEntryError";
import { MatchHandler } from "./MatchHandler";
import { PairingPolicy } from "./PairingPolicy";
import { Participant } from "./Participant";
import { PoolStore } from "./PoolStore";
import {
	CLEANUP_INTERVAL_MS,
	MATCHMAKING_FORMATS,
	MATCHMAKING_MODES,
	MatchmakingFormat,
	MatchmakingMode,
} from "./QueueEntry";

export interface MatchmakingPoolDeps {
	store: PoolStore;
	pairingPolicy: PairingPolicy;
	matchHandler: MatchHandler;
	now: () => number;
	/** Optional sink for one structured line per participant leaving the pool. */
	logger?: Logger;
}

/** Why a participant left the pool. */
export type QueueExitOutcome =
	| "matched_human"
	| "matched_bot"
	| "cancelled"
	| "dequeued"
	| "expired"
	| "replaced";

/**
 * Store-backed matchmaking pool keyed by format+mode. Owns the same-user
 * replacement critical section and the unref'd tick ticker that sweeps dead
 * participants, pairs the rest, then pushes status. Holds no transport code —
 * participants are reached only through their injected `ParticipantChannel`.
 */
export class MatchmakingPool {
	private interval: NodeJS.Timeout | null = null;

	constructor(private readonly deps: MatchmakingPoolDeps) {}

	/**
	 * A poll arrival for an already-queued user is rejected. A socket arrival
	 * replaces the existing entry for that user: the old participant is
	 * removed from the store first, then closed, so the userId index already
	 * points at the winner before any close-triggered callback can run.
	 */
	/** Returns `true` when this arrival replaced an existing participant for the same user. */
	add(participant: Participant): boolean {
		const existing = this.deps.store.findByUserId(participant.userId);
		if (existing) {
			if (participant.presence === "poll") {
				throw new DuplicateQueueEntryError(participant.userId);
			}
			this.removeAndLog(existing, "replaced");
			existing.channel.close("replaced_by_new_connection");
		}
		this.deps.store.add(participant);

		return existing !== undefined;
	}

	remove(id: string): void {
		this.removeByIdAndLog(id, "cancelled");
	}

	/** Returns `true` when the id was actually queued and removed; a no-op otherwise. */
	dequeueBySocketId(socketId: string): boolean {
		return this.removeByIdAndLog(socketId, "dequeued");
	}

	start(): void {
		if (this.interval) return;
		this.interval = setInterval(() => this.tick(), CLEANUP_INTERVAL_MS);
		this.interval.unref();
	}

	stop(): void {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	/**
	 * Sweeps dead participants, pairs the rest, then pushes status — strictly
	 * in that order, so a participant removed in an earlier step is never
	 * notified by a later one.
	 */
	tick(): void {
		const now = this.deps.now();
		this.sweepDead(now);
		this.pairAndDispatch(now);
		this.publishStatus(now);
	}

	private sweepDead(now: number): void {
		for (const participant of this.everyParticipant()) {
			if (!participant.channel.isAlive(now)) {
				this.removeAndLog(participant, "expired");
			}
		}
	}

	private pairAndDispatch(now: number): void {
		for (const [format, mode] of this.poolKeys()) {
			const candidates = this.deps.store.all(format, mode);
			if (candidates.length === 0) continue;

			for (const match of this.deps.pairingPolicy.pair(candidates, now)) {
				for (const participant of match.participants) {
					this.removeAndLog(
						participant,
						match.opponentKind === "bot" ? "matched_bot" : "matched_human",
					);
				}
				this.deps.matchHandler.handle(match);
			}
		}
	}

	private removeByIdAndLog(id: string, outcome: QueueExitOutcome): boolean {
		const participant = this.deps.store.get(id);
		if (!participant) return false;
		return this.removeAndLog(participant, outcome);
	}

	private removeAndLog(participant: Participant, outcome: QueueExitOutcome): boolean {
		const removed = this.deps.store.remove(participant.id);
		if (removed) {
			this.deps.logger?.info("matchmaking.exit", {
				participantId: participant.id,
				outcome,
				waitedMs: this.deps.now() - participant.enqueuedAt,
				format: participant.format,
				presence: participant.presence,
				hasBotFallback: participant.botFallbackAfterMs !== undefined,
			});
		}
		return removed;
	}

	private publishStatus(now: number): void {
		for (const participant of this.everyParticipant()) {
			participant.channel.status({
				state: "searching",
				waitedMs: now - participant.enqueuedAt,
			});
		}
	}

	/**
	 * Players currently queued per format, every mode summed; formats nobody
	 * is queued in report 0. Entries that dropped since the last tick are
	 * still counted until the next sweep (at most one cleanup interval).
	 */
	depthByFormat(): Record<MatchmakingFormat, number> {
		const depth = Object.fromEntries(MATCHMAKING_FORMATS.map((format) => [format, 0])) as Record<
			MatchmakingFormat,
			number
		>;
		for (const [format, mode] of this.poolKeys()) {
			depth[format] += this.deps.store.depth(format, mode);
		}

		return depth;
	}

	private *everyParticipant(): IterableIterator<Participant> {
		for (const [format, mode] of this.poolKeys()) {
			yield* this.deps.store.all(format, mode);
		}
	}

	private poolKeys(): ReadonlyArray<readonly [MatchmakingFormat, MatchmakingMode]> {
		const keys: Array<readonly [MatchmakingFormat, MatchmakingMode]> = [];
		for (const format of MATCHMAKING_FORMATS) {
			for (const mode of MATCHMAKING_MODES) {
				keys.push([format, mode]);
			}
		}
		return keys;
	}
}
