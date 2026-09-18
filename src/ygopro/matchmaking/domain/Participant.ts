import { ParticipantChannel } from "./ParticipantChannel";
import { MatchmakingFormat, MatchmakingMode } from "./QueueEntry";

/** How this participant reached the pool: pushed to over a live connection,
 * or pulled by an HTTP client that polls for status. */
export type ParticipantPresence = "socket" | "poll";

export interface Participant {
	/** `socket.id` for a socket presence, the auth ticket id for a poll presence. */
	readonly id: string;
	readonly userId: string;
	readonly format: MatchmakingFormat;
	readonly mode: MatchmakingMode;
	/** Public name resolved at auth/enqueue; null when unresolvable. */
	readonly displayName: string | null;
	readonly enqueuedAt: number;
	readonly presence: ParticipantPresence;
	readonly channel: ParticipantChannel;
}
