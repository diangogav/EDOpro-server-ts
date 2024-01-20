import { EventEmitter } from "stream";

import { MercuryClient } from "../../../mercury/client/domain/MercuryClient";
import { MercuryRoom } from "../../../mercury/room/domain/MercuryRoom";
import MercuryRoomList from "../../../mercury/room/infrastructure/MercuryRoomList";
import { YGOClientSocket } from "../../../socket-server/HostServer";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "../../messages/server-to-client/ServerErrorMessageClientMessage";
import { VersionErrorClientMessage } from "../../messages/server-to-client/VersionErrorClientMessage";
import { Logger } from "../../shared/logger/domain/Logger";
import { JoinMessageHandler } from "../../shared/room/domain/JoinMessageHandler";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class JoinHandler implements JoinMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: YGOClientSocket;

	constructor(eventEmitter: EventEmitter, logger: Logger, socket: YGOClientSocket) {
		this.eventEmitter = eventEmitter;
		this.logger = logger;
		this.socket = socket;
		this.eventEmitter.on(Commands.JOIN_GAME as unknown as string, (message: ClientMessage) =>
			this.handle(message)
		);
	}

	handle(message: ClientMessage): void {
		this.logger.info("JoinHandler");
		const joinMessage = new JoinGameMessage(message.data);
		const room = this.findRoom(joinMessage);

		if (!room) {
			this.socket.write(
				ServerErrorClientMessage.create("Sala no encontrada. Intenta recargando la lista")
			);

			this.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

			this.socket.destroy();

			return;
		}

		if (room instanceof MercuryRoom) {
			if (joinMessage.version2 !== 4960) {
				this.socket.write(VersionErrorClientMessage.create(4960));

				return;
			}
			const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
			const messages = [message.previousRawMessage, message.raw];
			const client = new MercuryClient({
				socket: this.socket,
				logger: this.logger,
				messages,
				name: playerInfoMessage.name,
				position: room.playersCount,
			});
			room.addClient(client);

			return;
		}

		if (room.password !== joinMessage.password) {
			this.socket.write(ServerErrorClientMessage.create("Clave incorrecta"));
			this.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));
			this.socket.destroy();

			return;
		}

		room.emit("JOIN", message, this.socket);
	}

	private findRoom(joinMessage: JoinGameMessage): MercuryRoom | Room | null {
		const room = RoomList.getRooms().find((room) => room.id === joinMessage.id);
		if (room) {
			return room;
		}

		return MercuryRoomList.findById(joinMessage.id);
	}
}
