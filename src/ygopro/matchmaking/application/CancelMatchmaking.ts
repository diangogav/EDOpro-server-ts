import { ISocket } from "@shared/socket/domain/ISocket";

import { MatchmakingPool } from "../domain/MatchmakingPool";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";

export interface CancelMatchmakingInput {
	readonly socket: ISocket;
	readonly session: Session;
	readonly channel: ParticipantChannel;
}

/**
 * Handles CTOS `MATCHMAKING_CANCEL` across the three possible queue states: a
 * queued participant is dequeued and acknowledged; an idle session is
 * acknowledged idempotently with nothing to remove; a session whose match
 * already formed is told cancellation is too late, and neither the pool nor
 * any room is touched.
 */
export class CancelMatchmaking {
	public constructor(private readonly pool: MatchmakingPool) {}

	public execute(input: CancelMatchmakingInput): void {
		const { socket, session, channel } = input;

		if (session.queueState === "matched") {
			channel.status({ state: "rejected", waitedMs: 0, reason: "cancel_too_late" });

			return;
		}

		if (session.queueState === "queued") {
			this.pool.dequeueBySocketId(socket.id as string);
			session.queueState = "idle";
		}

		channel.status({ state: "cancelled", waitedMs: 0 });
	}
}
