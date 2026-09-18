import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { ISocket } from "@shared/socket/domain/ISocket";

import { ParticipantChannel } from "./ParticipantChannel";
import { MatchmakingFormat, MatchmakingMode } from "./QueueEntry";

/** How this participant reached the pool: pushed to over a live connection,
 * or pulled by an HTTP client that polls for status. */
export type ParticipantPresence = "socket" | "poll";

/**
 * What room provisioning needs to seat a socket participant server-side via
 * `MATCH_ADMIT` once a room exists. Only ever set for a `"socket"` presence.
 */
export interface ParticipantAdmission {
	readonly socket: ISocket;
	readonly playerInfo: PlayerInfoMessage;
}

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
	/**
	 * Present only for a socket presence. A poll presence has no live
	 * connection to admit — it joins later through a real `CTOS_JOIN_GAME`
	 * using the `roomPassword` delivered by `channel.found()`.
	 */
	readonly admission?: ParticipantAdmission;
}
