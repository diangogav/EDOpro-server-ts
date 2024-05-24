/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { EventEmitter } from "stream";

import { JoinGameMessage } from "../../../../modules/messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../../modules/messages/MessageProcessor";
import { VersionErrorClientMessage } from "../../../../modules/messages/server-to-client/VersionErrorClientMessage";
import { RoomState } from "../../../../modules/room/domain/RoomState";
import { Logger } from "../../../../modules/shared/logger/domain/Logger";
import { YGOClientSocket } from "../../../../modules/shared/socket/domain/YGOClientSocket";
import { MercuryClient } from "../../../client/domain/MercuryClient";
import { mercuryConfig } from "../../../config";
import { MercuryRoom } from "../MercuryRoom";

export class MercuryWaitingState extends RoomState {
	constructor(eventEmitter: EventEmitter, private readonly logger: Logger) {
		super(eventEmitter);
		this.eventEmitter.on(
			"JOIN",
			(message: ClientMessage, room: MercuryRoom, socket: YGOClientSocket) =>
				void this.handle.bind(this)(message, room, socket)
		);
		this.eventEmitter.on(
			Commands.TRY_START as unknown as string,
			(message: ClientMessage, room: MercuryRoom, socket: YGOClientSocket) =>
				void this.tryStartHandler.bind(this)(message, room, socket)
		);
	}

	private handle(message: ClientMessage, room: MercuryRoom, socket: YGOClientSocket): void {
		const joinMessage = new JoinGameMessage(message.data);

		if (joinMessage.version2 !== mercuryConfig.version) {
			socket.write(VersionErrorClientMessage.create(mercuryConfig.version));

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
			room,
		});
		room.addClient(client);
	}

	private tryStartHandler(
		_message: ClientMessage,
		room: MercuryRoom,
		_socket: YGOClientSocket
	): void {
		this.logger.info("MERCURY: TRY_START");
		room.rps();
	}
}
