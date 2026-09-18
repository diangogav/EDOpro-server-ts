import {
	MatchFoundNotice,
	MatchmakingStatusUpdate,
	ParticipantChannel,
	RejectionReason,
} from "../domain/ParticipantChannel";
import { QueueEntry, QUEUE_TTL_MS } from "../domain/QueueEntry";

/**
 * `ParticipantChannel` for the HTTP poll leg. The client pulls its outcome via
 * `GET /api/matchmaking/status`, so there is no frame to push: `status()` is a
 * no-op and `found()` only mutates the shared poll record the facade reads
 * back on the next poll. Liveness is TTL-based on `lastPollAt`, unlike a
 * socket channel's `!socket.closed`.
 */
export class PollParticipantChannel implements ParticipantChannel {
	constructor(
		private readonly record: QueueEntry,
		private readonly now: () => number,
	) {}

	status(_update: MatchmakingStatusUpdate): void {
		// Poll participants are pulled, never pushed (D19).
	}

	found(notice: MatchFoundNotice): void {
		this.record.state = "matched";
		this.record.matchedAt = this.now();
		this.record.roomId = notice.roomId;
		this.record.roomPassword = notice.roomPassword;
		this.record.opponentType = notice.opponentType;
		this.record.rated = notice.rated;
		this.record.opponentName = notice.opponentName;
	}

	close(_reason: RejectionReason): void {
		// No live connection to notify; the record's removal is the pool's job.
	}

	isAlive(now: number): boolean {
		return now - this.record.lastPollAt <= QUEUE_TTL_MS;
	}
}
