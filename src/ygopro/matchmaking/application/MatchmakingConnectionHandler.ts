import { EventEmitter } from "stream";

import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ISocket } from "@shared/socket/domain/ISocket";

import { ParticipantChannel } from "../domain/ParticipantChannel";
import { Session } from "../domain/Session";
import { parseCtosAuth, parseCtosCancel, parseCtosEnter } from "../protocol/matchmaking-protocol";
import { AuthenticateMatchmakingSession } from "./AuthenticateMatchmakingSession";
import { CancelMatchmaking } from "./CancelMatchmaking";
import { EnterMatchmaking } from "./EnterMatchmaking";

/**
 * Built once per connection by the socket-server's connection wiring (D1,
 * D24): subscribes to `PLAYER_INFO` and the three CTOS matchmaking opcodes on
 * the connection's `EventEmitter` in its constructor, mirroring how
 * `YGOProJoinHandler` subscribes to `JOIN_GAME`. Frame parsing stays owned
 * here — a frame that fails its opcode's parser is answered with a rejected
 * STATUS reply and never reaches a use case.
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
	) {
		this.eventEmitter.on(Commands.PLAYER_INFO as unknown as string, this.onPlayerInfo);
		this.eventEmitter.on(Commands.MATCHMAKING_AUTH as unknown as string, this.onAuth);
		this.eventEmitter.on(Commands.MATCHMAKING_ENTER as unknown as string, this.onEnter);
		this.eventEmitter.on(Commands.MATCHMAKING_CANCEL as unknown as string, this.onCancel);
	}

	private readonly onPlayerInfo = (message: ClientMessage): void => {
		this.session.capturePlayerInfo(message.data);
	};

	private readonly onAuth = (message: ClientMessage): void => {
		const result = parseCtosAuth(message.data);
		if (!result.ok) {
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
		});
	};

	private readonly onCancel = (message: ClientMessage): void => {
		const result = parseCtosCancel(message.data);
		if (!result.ok) {
			this.channel.status({ state: "rejected", waitedMs: 0, reason: result.reason });

			return;
		}

		this.cancel.execute({ socket: this.socket, session: this.session, channel: this.channel });
	};
}
