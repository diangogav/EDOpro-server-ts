import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ISocket } from "@shared/socket/domain/ISocket";

import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";
import {
	parseCtosAuth,
	parseCtosCancel,
	parseCtosEnter,
	parseCtosMatchResponse,
} from "../protocol/matchmaking-protocol";
import { AuthenticateMatchmakingSession } from "./AuthenticateMatchmakingSession";
import { CancelMatchmaking } from "./CancelMatchmaking";
import { EnterMatchmaking } from "./EnterMatchmaking";
import { MatchProposalResponse, RespondToMatchProposal } from "./RespondToMatchProposal";

/**
 * Built once per connection by the socket-server's connection wiring (D1,
 * D24): subscribes to `PLAYER_INFO` and the CTOS matchmaking opcodes on the
 * connection's `EventEmitter` in its constructor, mirroring how
 * `YGOProJoinHandler` subscribes to `JOIN_GAME`. Frame parsing stays owned
 * here — a frame that fails its opcode's parser is answered with a rejected
 * STATUS reply and never reaches a use case. ACCEPT and DECLINE are only
 * subscribed when a `RespondToMatchProposal` is wired.
 */
export class MatchmakingConnectionHandler {
	public constructor(
		private readonly eventEmitter: EventEmitter,
		private readonly socket: ISocket,
		private readonly session: Session,
		private readonly channel: ParticipantChannel,
		private readonly authenticate: AuthenticateMatchmakingSession,
		private readonly enter: EnterMatchmaking,
		private readonly cancel: CancelMatchmaking,
		private readonly logger: Logger,
		private readonly respond?: RespondToMatchProposal,
	) {
		this.eventEmitter.on(Commands.PLAYER_INFO as unknown as string, this.onPlayerInfo);
		this.eventEmitter.on(Commands.MATCHMAKING_AUTH as unknown as string, this.onAuth);
		this.eventEmitter.on(Commands.MATCHMAKING_ENTER as unknown as string, this.onEnter);
		this.eventEmitter.on(Commands.MATCHMAKING_CANCEL as unknown as string, this.onCancel);
		if (this.respond) {
			this.eventEmitter.on(Commands.MATCHMAKING_ACCEPT as unknown as string, this.onAccept);
			this.eventEmitter.on(Commands.MATCHMAKING_DECLINE as unknown as string, this.onDecline);
		}
	}

	private readonly onPlayerInfo = (message: ClientMessage): void => {
		this.session.capturePlayerInfo(message.data);
	};

	private readonly onAuth = (message: ClientMessage): void => {
		const result = parseCtosAuth(message.data);
		if (!result.ok) {
			this.logger.warn("matchmaking.rejected", { reason: result.reason, opcode: "AUTH" });
			this.channel.status({ state: "rejected", waitedMs: 0, reason: result.reason });

			return;
		}

		void this.authenticate.execute({
			ticket: result.value.ticket,
			remoteAddress: this.socket.remoteAddress,
			session: this.session,
			channel: this.channel,
		});
	};

	private readonly onEnter = (message: ClientMessage): void => {
		const result = parseCtosEnter(message.data);
		if (!result.ok) {
			this.logger.warn("matchmaking.rejected", { reason: result.reason, opcode: "ENTER" });
			this.channel.status({ state: "rejected", waitedMs: 0, reason: result.reason });

			return;
		}

		this.enter.execute({
			socket: this.socket,
			session: this.session,
			channel: this.channel,
			format: result.value.format,
			mode: result.value.mode,
			clientVersion: result.value.clientVersion,
			botFallbackAfterMs: result.value.botFallbackAfterMs,
			supportsAcceptStep: result.value.supportsAcceptStep,
		});
	};

	private readonly onAccept = (message: ClientMessage): void => {
		this.respondToProposal(message, "accept", "ACCEPT");
	};

	private readonly onDecline = (message: ClientMessage): void => {
		this.respondToProposal(message, "decline", "DECLINE");
	};

	private respondToProposal(
		message: ClientMessage,
		response: MatchProposalResponse,
		opcode: string,
	): void {
		const result = parseCtosMatchResponse(message.data);
		if (!result.ok) {
			this.logger.warn("matchmaking.rejected", { reason: result.reason, opcode });
			this.channel.status({ state: "rejected", waitedMs: 0, reason: result.reason });

			return;
		}

		this.respond?.execute({
			socket: this.socket,
			channel: this.channel,
			matchId: result.value.matchId,
			response,
		});
	}

	private readonly onCancel = (message: ClientMessage): void => {
		const result = parseCtosCancel(message.data);
		if (!result.ok) {
			this.logger.warn("matchmaking.rejected", { reason: result.reason, opcode: "CANCEL" });
			this.channel.status({ state: "rejected", waitedMs: 0, reason: result.reason });

			return;
		}

		this.cancel.execute({ socket: this.socket, session: this.session, channel: this.channel });
	};
}
