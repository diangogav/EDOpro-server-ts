import { EventEmitter } from "stream";

import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ReconnectionAckMessage } from "@shared/messages/server-to-client/ReconnectionAckMessage";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { logReconnectAttempt, ReconnectOutcome } from "./logReconnectAttempt";
import { ISocket } from "@shared/socket/domain/ISocket";
import { redactSecret } from "@shared/logger/domain/redactSecret";

const REJECTION_REASON: Record<ReconnectOutcome, string> = {
	unknown_token: "no player found for token",
	room_not_found: "room not found for token",
	identity_missing: "no account on the connection for the seat owner's token",
	identity_mismatch: "account does not match seat owner for token",
	forwarded: "forwarded token",
	matched: "matched token",
};

// Generic, transport-agnostic express-reconnect router. It lives at the
// CONNECTION level: it receives the raw 0xfd RECONNECT frame (emitted by
// MessageEmitter on the per-connection emitter when a freshly reopened socket
// sends [0xfd][token]), looks the token up in the global TokenIndex, and forwards
// it to the owning room as an "EXPRESS_RECONNECT" event. The room's CURRENT phase
// then performs the subtree-specific re-sync.
//
// Each subtree injects:
//   - resolveRoom: maps a roomId to its room (RoomList vs YGOProRoomList),
//   - clientGuard: narrows the token's client to the subtree's client type
//                  (instanceof Client vs instanceof YGOProClient).
//
// The token → room → emit orchestration is common; the re-sync is not.
export class ExpressReconnectHandler {
	constructor(
		private readonly eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly socket: ISocket,
		private readonly resolveRoom: (roomId: number) => YgoRoom | undefined,
		private readonly clientGuard: (client: YgoClient) => boolean,
	) {
		this.eventEmitter.on(Commands.RECONNECT as unknown as string, (message: ClientMessage) =>
			this.handle(message),
		);
	}

	private handle(message: ClientMessage): void {
		const token = message.data.toString("utf8");
		this.logger.info(`Express reconnect: checking token ${redactSecret(token)}`);

		const entry = TokenIndex.getInstance().find(token);
		const client = entry && this.clientGuard(entry.client) ? entry.client : null;
		const identityChecked = client !== null && this.checksIdentity(client);

		if (client && entry) {
			const identityOutcome = this.identityOutcome(client);
			if (identityOutcome) {
				this.reject(token, client, identityChecked, identityOutcome);

				return;
			}
			const room = this.resolveRoom(entry.roomId);
			if (room) {
				this.logger.info(`Express reconnect: match for ${client.name} in room ${entry.roomId}`);
				logReconnectAttempt(this.logger, {
					path: "token",
					outcome: "forwarded",
					socket: this.socket,
					client,
					identityChecked,
					token,
				});
				room.emit("EXPRESS_RECONNECT", message, this.socket);

				return;
			}
			this.reject(token, client, identityChecked, "room_not_found");

			return;
		}

		this.reject(token, null, false, "unknown_token");
	}

	private reject(
		token: string,
		client: YgoClient | null,
		identityChecked: boolean,
		outcome: ReconnectOutcome,
	): void {
		this.logger.info(`Express reconnect: ${REJECTION_REASON[outcome]} ${redactSecret(token)}`);
		logReconnectAttempt(this.logger, {
			path: "token",
			outcome,
			socket: this.socket,
			client,
			identityChecked,
			token,
		});
		this.socket.send(ReconnectionAckMessage.failure());
		this.socket.destroy();
	}

	// A verified seat belongs to one account: the reconnecting socket must have
	// proven that same account (handshake ticket on WS, MATCHMAKING_AUTH on TCP).
	// A socket without a resolved identity is refused, including when the ticket
	// store was unavailable at handshake. Non-verified seats are token-only.
	private checksIdentity(client: YgoClient): boolean {
		return client.credential?.kind === "verified";
	}

	private identityOutcome(client: YgoClient): "identity_missing" | "identity_mismatch" | null {
		const credential = client.credential;
		if (credential?.kind !== "verified") {
			return null;
		}
		if (!this.socket.resolvedUserId) {
			return "identity_missing";
		}

		return credential.userId === this.socket.resolvedUserId ? null : "identity_mismatch";
	}
}
