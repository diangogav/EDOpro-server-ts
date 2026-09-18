import { MatchHandler } from "./MatchHandler";
import { DuplicateQueueEntryError } from "./MatchmakingQueue";
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
}

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
	add(participant: Participant): void {
		const existing = this.deps.store.findByUserId(participant.userId);
		if (existing) {
			if (participant.presence === "poll") {
				throw new DuplicateQueueEntryError(participant.userId);
			}
			this.deps.store.remove(existing.id);
			existing.channel.close("replaced_by_new_connection");
		}
		this.deps.store.add(participant);
	}

	remove(id: string): void {
		this.deps.store.remove(id);
	}

	/** No-op when the id was never queued. */
	dequeueBySocketId(socketId: string): void {
		this.deps.store.remove(socketId);
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
				this.deps.store.remove(participant.id);
			}
		}
	}

	private pairAndDispatch(now: number): void {
		for (const [format, mode] of this.poolKeys()) {
			const candidates = this.deps.store.all(format, mode);
			if (candidates.length === 0) continue;

			for (const match of this.deps.pairingPolicy.pair(candidates, now)) {
				for (const participant of match.participants) {
					this.deps.store.remove(participant.id);
				}
				this.deps.matchHandler.handle(match);
			}
		}
	}

	private publishStatus(now: number): void {
		for (const participant of this.everyParticipant()) {
			participant.channel.status({
				state: "searching",
				waitedMs: now - participant.enqueuedAt,
			});
		}
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
