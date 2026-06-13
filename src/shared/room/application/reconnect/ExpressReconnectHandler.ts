import { EventEmitter } from "stream";

import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { ReconnectionAckMessage } from "@shared/messages/server-to-client/ReconnectionAckMessage";
import { TokenIndex } from "@shared/room/domain/TokenIndex";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";

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
		this.eventEmitter.on(
			Commands.RECONNECT as unknown as string,
			(message: ClientMessage) => this.handle(message),
		);
	}

	private handle(message: ClientMessage): void {
		const token = message.data.toString("utf8");
		this.logger.info(`Express reconnect: checking token ${token}`);

		const entry = TokenIndex.getInstance().find(token);
		if (entry && this.clientGuard(entry.client)) {
			const room = this.resolveRoom(entry.roomId);
			if (room) {
				this.logger.info(
					`Express reconnect: match for ${entry.client.name} in room ${entry.roomId}`,
				);
				room.emit("EXPRESS_RECONNECT", message, this.socket);

				return;
			}
		}

		this.logger.info(`Express reconnect: no player found for token ${token}`);
		this.socket.send(ReconnectionAckMessage.failure());
		this.socket.destroy();
	}
}
