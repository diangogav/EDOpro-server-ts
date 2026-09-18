import { ISocket } from "@shared/socket/domain/ISocket";

import {
	MatchFoundNotice,
	MatchmakingStatusState,
	MatchmakingStatusUpdate,
	ParticipantChannel,
	RejectionReason,
} from "../domain/ParticipantChannel";
import {
	buildStocMatchmakingFoundFrame,
	buildStocMatchmakingStatusFrame,
} from "../protocol/matchmaking-protocol";

/**
 * `ParticipantChannel` over a live `ISocket` connection: every call becomes a
 * STOC frame. Liveness tracks the socket directly — no TTL bookkeeping, unlike
 * the poll leg.
 */
export class SocketParticipantChannel implements ParticipantChannel {
	public constructor(private readonly socket: ISocket) {}

	public status(update: MatchmakingStatusUpdate): void {
		this.socket.send(
			buildStocMatchmakingStatusFrame(update.state, update.waitedMs, update.reason ?? "none"),
		);
	}

	public found(notice: MatchFoundNotice): void {
		this.socket.send(
			buildStocMatchmakingFoundFrame({
				opponentType: notice.opponentType,
				rated: notice.rated,
				roomId: notice.roomId,
				matchId: notice.matchId,
				opponentName: notice.opponentName,
			}),
		);
	}

	public close(reason: RejectionReason): void {
		const state: MatchmakingStatusState =
			reason === "replaced_by_new_connection" ? "replaced" : "rejected";
		this.socket.send(buildStocMatchmakingStatusFrame(state, 0, reason));
		this.socket.close();
	}

	public isAlive(_now: number): boolean {
		return !this.socket.closed;
	}
}
