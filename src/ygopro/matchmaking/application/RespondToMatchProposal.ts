import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";

import { MatchmakingPool } from "../domain/MatchmakingPool";
import { ParticipantChannel } from "../domain/ParticipantChannel";

export type MatchProposalResponse = "accept" | "decline";

export interface RespondToMatchProposalInput {
	readonly socket: ISocket;
	readonly channel: ParticipantChannel;
	readonly matchId: string;
	readonly response: MatchProposalResponse;
}

const OPCODE_BY_RESPONSE: Readonly<Record<MatchProposalResponse, string>> = Object.freeze({
	accept: "ACCEPT",
	decline: "DECLINE",
});

/**
 * Handles CTOS `MATCHMAKING_ACCEPT` and `MATCHMAKING_DECLINE` for this
 * connection's participant. The pool owns what a response triggers (room
 * provisioning, requeue, closing a decliner); this use case only rejects a
 * response for a match that is unknown, expired, or not this participant's.
 */
export class RespondToMatchProposal {
	public constructor(
		private readonly pool: MatchmakingPool,
		private readonly logger: Logger,
	) {}

	public execute(input: RespondToMatchProposalInput): void {
		const { socket, channel, matchId, response } = input;
		const participantId = socket.id as string;
		const outcome =
			response === "accept"
				? this.pool.accept(matchId, participantId)
				: this.pool.decline(matchId, participantId);

		if (outcome === "unknown_match") {
			this.logger.warn("matchmaking.rejected", {
				reason: "unknown_match",
				opcode: OPCODE_BY_RESPONSE[response],
			});
			channel.status({ state: "rejected", waitedMs: 0, reason: "unknown_match" });
		}
	}
}
