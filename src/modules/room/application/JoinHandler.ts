import { EventEmitter } from "stream";

import { YGOClientSocket } from "../../../socket-server/HostServer";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "../../messages/server-to-client/ServerErrorMessageClientMessage";
import { Logger } from "../../shared/logger/domain/Logger";
import RoomList from "../infrastructure/RoomList";

export class JoinHandler {
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
		const room = RoomList.getRooms().find((room) => room.id === joinMessage.id);

		if (!room) {
			this.socket.write(
				ServerErrorClientMessage.create("Sala no encontrada. Intenta recargando la lista")
			);

			this.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

			this.socket.destroy();

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
}
