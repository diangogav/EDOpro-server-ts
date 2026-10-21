import { Logger } from "@shared/logger/domain/Logger";

import { DuplicateQueueEntryError } from "./DuplicateQueueEntryError";
import { MatchHandler } from "./MatchHandler";
import { Match } from "./Match";
import { PairingPolicy } from "./PairingPolicy";
import { Participant } from "./Participant";
import { PendingMatch, PendingMatches } from "./PendingMatches";
import { PoolStore } from "./PoolStore";
import {
	CLEANUP_INTERVAL_MS,
	MATCH_ACCEPT_TIMEOUT_MS,
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
	| "replaced"
	| "declined"
	| "accept_timeout";

export type MatchResponseOutcome = "accepted" | "declined" | "requeued" | "unknown_match";

/** Bot matches never wait; a human match waits when anyone in it opted in. */
function requiresAcceptStep(match: Match): boolean {
	return (
		match.opponentKind === "human" &&
		match.participants.some((participant) => participant.supportsAcceptStep === true)
	);
}

/**
 * Store-backed matchmaking pool keyed by format+mode. Owns the same-user
 * replacement critical section and the unref'd tick ticker that sweeps dead
 * participants, pairs the rest, then pushes status. Holds no transport code —
 * participants are reached only through their injected `ParticipantChannel`.
 *
 * A human match with at least one participant opted into the accept step is
 * held as pending instead of dispatched: its participants leave the store, so
 * they are never paired again, and the match reaches the `MatchHandler` only
 * once everyone accepted. A decline or timeout returns the other participants
 * to the store unchanged, so FIFO ordering puts them first again.
 */
export class MatchmakingPool {
	private interval: NodeJS.Timeout | null = null;
	private readonly pending = new PendingMatches();
	/**
	 * Participants an abandoned match put back in the pool, keyed by match id,
	 * until that match's accept window closes: their own answer to it may still
	 * be in flight and must not be rejected as unknown.
	 */
	private readonly requeuedByMatchId = new Map<string, { ids: Set<string>; until: number }>();

	constructor(private readonly deps: MatchmakingPoolDeps) {}

	/**
	 * A poll arrival for an already-queued user is rejected. A socket arrival
	 * replaces the existing entry for that user: the old participant is
	 * removed from the store first, then closed, so the userId index already
	 * points at the winner before any close-triggered callback can run. A user
	 * whose match is pending counts as queued; replacing it abandons that match.
	 */
	/** Returns `true` when this arrival replaced an existing participant for the same user. */
	add(participant: Participant): boolean {
		const queued = this.deps.store.findByUserId(participant.userId);
		const pending = queued ? undefined : this.pending.findByUserId(participant.userId);
		const existing = queued ?? pending?.participant;
		if (existing) {
			if (participant.presence === "poll") {
				throw new DuplicateQueueEntryError(participant.userId);
			}
			if (pending) {
				this.abandon(pending.pending, [existing], "replaced");
			} else {
				this.removeAndLog(existing, "replaced");
			}
			existing.channel.close("replaced_by_new_connection");
		}
		this.deps.store.add(participant);

		return existing !== undefined;
	}

	remove(id: string): void {
		if (!this.removeByIdAndLog(id, "cancelled")) {
			this.leavePending(id, "cancelled");
		}
	}

	/**
	 * Returns `true` when the id was actually queued and removed; a no-op
	 * otherwise. A participant whose match is pending counts as declining it.
	 */
	dequeueBySocketId(socketId: string): boolean {
		return this.removeByIdAndLog(socketId, "dequeued") || this.leavePending(socketId, "declined");
	}

	/** Whether the id is searching in the store or waiting on a pending match. */
	isQueued(id: string): boolean {
		return (
			this.deps.store.get(id) !== undefined || this.pending.findByParticipantId(id) !== undefined
		);
	}

	/**
	 * Records an ACCEPT. Once every participant accepted, the match leaves the
	 * pending book and is dispatched to the `MatchHandler` like any other match.
	 * An unknown or expired match id, or a participant outside it, changes nothing.
	 */
	accept(matchId: string, participantId: string): MatchResponseOutcome {
		const pending = this.findLivePending(matchId, participantId);
		if (!pending)
			return this.wasRequeuedFrom(matchId, participantId) ? "requeued" : "unknown_match";

		pending.accepted.add(participantId);
		this.deps.logger?.info("matchmaking.accepted", { matchId, participantId });

		const { match } = pending;
		if (match.participants.every((participant) => pending.accepted.has(participant.id))) {
			this.pending.delete(matchId);
			this.dispatch(match);
		}

		return "accepted";
	}

	/** Records a DECLINE: the decliner leaves the queue and the others return to the pool. */
	decline(matchId: string, participantId: string): MatchResponseOutcome {
		const pending = this.findLivePending(matchId, participantId);
		if (!pending) return this.declineAfterRequeue(matchId, participantId);

		const decliner = pending.match.participants.find(
			(participant) => participant.id === participantId,
		) as Participant;
		this.abandon(pending, [decliner], "declined");
		decliner.channel.close("declined");

		return "declined";
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
	 * Sweeps dead participants, resolves pending matches, pairs the rest, then
	 * pushes status — strictly in that order, so a participant removed in an
	 * earlier step is never notified by a later one, and a participant returned
	 * by a declined or timed-out match can be paired in the same tick.
	 */
	tick(): void {
		const now = this.deps.now();
		this.sweepDead(now);
		this.resolvePending(now);
		this.forgetClosedRequeues(now);
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
				if (requiresAcceptStep(match)) {
					this.propose(match, now);
					continue;
				}
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

	private propose(match: Match, now: number): void {
		for (const participant of match.participants) {
			this.deps.store.remove(participant.id);
		}
		this.pending.add(match, now + MATCH_ACCEPT_TIMEOUT_MS);
		this.deps.logger?.info("matchmaking.proposed", {
			matchId: match.id,
			format: match.format,
			mode: match.mode,
			acceptWithinMs: MATCH_ACCEPT_TIMEOUT_MS,
		});
		for (const participant of match.participants) {
			if (participant.supportsAcceptStep !== true) continue;
			participant.channel.proposed({ matchId: match.id, acceptWithinMs: MATCH_ACCEPT_TIMEOUT_MS });
		}
	}

	private dispatch(match: Match): void {
		for (const participant of match.participants) {
			this.logExit(participant, "matched_human");
		}
		this.deps.matchHandler.handle(match);
	}

	/**
	 * A dead participant abandons its pending match like a decline. Past the
	 * deadline, every participant that has not accepted times out.
	 */
	private resolvePending(now: number): void {
		for (const pending of this.pending.all()) {
			const dead = pending.match.participants.filter(
				(participant) => !participant.channel.isAlive(now),
			);
			if (dead.length > 0) {
				this.abandon(pending, dead, "expired");
				continue;
			}
			if (now < pending.deadline) continue;

			const late = pending.match.participants.filter(
				(participant) => !pending.accepted.has(participant.id),
			);
			this.abandon(pending, late, "accept_timeout");
			for (const participant of late) {
				participant.channel.close("accept_timeout");
			}
		}
	}

	private wasRequeuedFrom(matchId: string, participantId: string): boolean {
		const record = this.requeuedByMatchId.get(matchId);

		return record !== undefined && this.deps.now() < record.until && record.ids.has(participantId);
	}

	/**
	 * A DECLINE that arrives after the opponent already abandoned the match
	 * still means "take me out of the queue": the participant leaves wherever
	 * the requeue put it (back in the pool or inside a newer proposal).
	 */
	private declineAfterRequeue(matchId: string, participantId: string): MatchResponseOutcome {
		if (!this.wasRequeuedFrom(matchId, participantId)) return "unknown_match";
		this.requeuedByMatchId.get(matchId)?.ids.delete(participantId);

		const participant =
			this.deps.store.get(participantId) ??
			this.pending.findByParticipantId(participantId)?.participant;
		if (!participant) return "unknown_match";
		if (!this.removeByIdAndLog(participantId, "declined")) {
			this.leavePending(participantId, "declined");
		}
		participant.channel.close("declined");

		return "declined";
	}

	private forgetClosedRequeues(now: number): void {
		for (const [matchId, record] of this.requeuedByMatchId) {
			if (now >= record.until) this.requeuedByMatchId.delete(matchId);
		}
	}

	private findLivePending(matchId: string, participantId: string): PendingMatch | undefined {
		const pending = this.pending.get(matchId);
		if (!pending || this.deps.now() >= pending.deadline) return undefined;
		const isInMatch = pending.match.participants.some(
			(participant) => participant.id === participantId,
		);

		return isInMatch ? pending : undefined;
	}

	private leavePending(id: string, outcome: QueueExitOutcome): boolean {
		const found = this.pending.findByParticipantId(id);
		if (!found) return false;
		this.abandon(found.pending, [found.participant], outcome);

		return true;
	}

	/**
	 * Drops a pending match: `leaving` exit the queue, everyone else goes back
	 * into the pool through `add` with their original `enqueuedAt` and is told
	 * it is searching again. Closing the leavers' channels is the caller's call.
	 */
	private abandon(
		pending: PendingMatch,
		leaving: readonly Participant[],
		outcome: QueueExitOutcome,
	): void {
		const { match } = pending;
		this.pending.delete(match.id);
		const event =
			outcome === "accept_timeout" ? "matchmaking.accept_timeout" : "matchmaking.declined";
		for (const participant of leaving) {
			this.logExit(participant, outcome);
			this.deps.logger?.info(event, { matchId: match.id, participantId: participant.id, outcome });
		}

		const now = this.deps.now();
		const requeued = match.participants.filter((participant) => !leaving.includes(participant));
		if (requeued.length > 0) {
			this.requeuedByMatchId.set(match.id, {
				ids: new Set(requeued.map((participant) => participant.id)),
				until: pending.deadline,
			});
		}
		for (const participant of requeued) {
			this.add(participant);
			participant.channel.status({ state: "searching", waitedMs: now - participant.enqueuedAt });
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
			this.logExit(participant, outcome);
		}
		return removed;
	}

	private logExit(participant: Participant, outcome: QueueExitOutcome): void {
		this.deps.logger?.info("matchmaking.exit", {
			participantId: participant.id,
			outcome,
			waitedMs: this.deps.now() - participant.enqueuedAt,
			format: participant.format,
			presence: participant.presence,
			hasBotFallback: participant.botFallbackAfterMs !== undefined,
		});
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
