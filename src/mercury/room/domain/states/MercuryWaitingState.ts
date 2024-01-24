/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { EventEmitter } from "stream";

import { JoinGameMessage } from "../../../../modules/messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../modules/messages/client-to-server/PlayerInfoMessage";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { VersionErrorClientMessage } from "../../../../modules/messages/server-to-client/VersionErrorClientMessage";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryWaitingState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: YGOClientSocket) =>
				void this.handle.bind(this)(message, room, socket)
		);
	}

	private handle(message: ClientMessage, room: MercuryRoom, socket: YGOClientSocket): void {
		const joinMessage = new JoinGameMessage(message.data);

		if (joinMessage.version2 !== 4960) {
			socket.write(VersionErrorClientMessage.create(4960));

			return;
		}
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const messages = [message.previousRawMessage, message.raw];
		const client = new MercuryClient({
			socket,
			logger: this.logger,
			messages,
			name: playerInfoMessage.name,
			position: room.playersCount,
		});
		room.addClient(client);
	}
}
