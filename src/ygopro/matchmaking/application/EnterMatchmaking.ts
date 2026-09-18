import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";
import { mercuryConfig } from "@ygopro/config";

import { MatchmakingPool } from "../domain/MatchmakingPool";
import { Participant } from "../domain/Participant";
import { ParticipantChannel } from "../domain/ParticipantChannel";
import { MatchmakingFormat, MatchmakingMode } from "../domain/QueueEntry";
import { Session } from "../domain/Session";

export interface EnterMatchmakingInput {
	readonly socket: ISocket;
	readonly session: Session;
	readonly channel: ParticipantChannel;
	readonly format: MatchmakingFormat;
	readonly mode: MatchmakingMode;
	readonly clientVersion: number;
}

/**
 * Handles CTOS `MATCHMAKING_ENTER`. `format` and `mode` arrive already
 * validated against the wire's frozen code tables, so there is no runtime
 * guard for them here — only checks that can actually fail at this layer do:
 * authentication, captured PLAYER_INFO, client version, and this session's
 * own queue state, in that order.
 */
export class EnterMatchmaking {
	public constructor(
		private readonly pool: MatchmakingPool,
		private readonly now: () => number,
		private readonly logger: Logger,
	) {}

	public execute(input: EnterMatchmakingInput): void {
		const { socket, session, channel, format, mode, clientVersion } = input;

		if (!session.isAuthenticated) {
			channel.status({ state: "rejected", waitedMs: 0, reason: "not_authenticated" });

			return;
		}

		const playerInfo = session.playerInfo;
		if (!playerInfo) {
			channel.status({ state: "rejected", waitedMs: 0, reason: "missing_player_info" });

			return;
		}

		if (clientVersion !== mercuryConfig.version) {
			channel.close("version_mismatch");

			return;
		}

		if (session.queueState === "queued") {
			channel.status({ state: "rejected", waitedMs: 0, reason: "already_queued" });

			return;
		}

		const participant: Participant = {
			id: socket.id as string,
			userId: socket.resolvedUserId as string,
			format,
			mode,
			displayName: session.displayName,
			enqueuedAt: this.now(),
			presence: "socket",
			channel,
			admission: { socket, playerInfo },
		};

		const replaced = this.pool.add(participant);
		if (replaced) {
			this.logger.info("matchmaking.replaced", { userId: participant.userId });
		}
		session.queueState = "queued";
		channel.status({ state: "searching", waitedMs: 0 });
		this.logger.info("matchmaking.enter", {
			userId: participant.userId,
			format,
			mode,
			presence: "socket",
		});
		this.pool.tick();
	}
}
