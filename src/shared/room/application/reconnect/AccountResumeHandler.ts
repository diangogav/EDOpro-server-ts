import { EventEmitter } from "stream";

import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ReconnectionAckMessage } from "@shared/messages/server-to-client/ReconnectionAckMessage";
import {
	ResumeInfo,
	ResumeInfoClientMessage,
} from "@shared/messages/server-to-client/ResumeInfoClientMessage";
import { AccountSeat } from "@shared/room/domain/reconnect/findSeatOfUser";
import { logReconnectAttempt } from "@shared/room/domain/reconnect/logReconnectAttempt";
import { ReconnectionTokenIssuer } from "@shared/room/domain/reconnect/ReconnectionTokenIssuer";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";

export interface AccountResumeRoute {
	/** The seat the account holds in a started match on this server, if any. */
	seatOf(userId: string): AccountSeat | null;
	/** What the resuming device needs to draw the duel. */
	resumeInfoOf(seat: AccountSeat): ResumeInfo;
	/** The socket the room is handed: this one, or one adapted to the room's wire format. */
	socketFor(room: YgoRoom, socket: ISocket): ISocket;
}

/**
 * Takes over the seat of the connection's account from another device (CTOS
 * RESUME_SEAT). The account comes from the handshake ticket, never from the
 * frame. The seat's reconnection token is rotated, so the device that held the
 * seat can no longer take it back with its copy, and the room is then asked to
 * re-sync exactly as for a token reconnection; it closes the old socket with
 * "session superseded". A connection without an account, or an account without
 * a seat, gets the failure ack and is closed.
 */
export class AccountResumeHandler {
	public constructor(
		private readonly eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly socket: ISocket,
		private readonly route: AccountResumeRoute,
	) {
		this.eventEmitter.on(Commands.RESUME_SEAT as unknown as string, (message: ClientMessage) =>
			this.handle(message),
		);
	}

	private handle(message: ClientMessage): void {
		const userId = this.socket.resolvedUserId;
		if (!userId) {
			this.reject(null, "identity_missing");

			return;
		}
		const seat = this.route.seatOf(userId);
		if (!seat) {
			this.reject(null, "no_seat");

			return;
		}

		const token = ReconnectionTokenIssuer.rotate(seat.client, seat.room.id);
		this.socket.send(ResumeInfoClientMessage.create(this.route.resumeInfoOf(seat)));
		logReconnectAttempt(this.logger, {
			path: "account",
			outcome: "forwarded",
			socket: this.socket,
			client: seat.client,
			identityChecked: true,
			token,
		});
		seat.room.emit(
			"EXPRESS_RECONNECT",
			{ ...message, command: Commands.RECONNECT, data: Buffer.from(token, "utf8") },
			this.route.socketFor(seat.room, this.socket),
		);
	}

	private reject(client: YgoClient | null, outcome: "identity_missing" | "no_seat"): void {
		logReconnectAttempt(this.logger, {
			path: "account",
			outcome,
			socket: this.socket,
			client,
			identityChecked: outcome === "no_seat",
		});
		this.socket.send(ReconnectionAckMessage.failure());
		this.socket.destroy();
	}
}
