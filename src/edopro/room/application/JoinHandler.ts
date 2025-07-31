import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { EventEmitter } from "stream";

import { MercuryRoom } from "../../../mercury/room/domain/MercuryRoom";
import MercuryRoomList from "../../../mercury/room/infrastructure/MercuryRoomList";
import { Logger } from "../../../shared/logger/domain/Logger";
import { JoinMessageHandler } from "../../../shared/room/domain/JoinMessageHandler";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { ServerErrorClientMessage } from "../../messages/server-to-client/ServerErrorMessageClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class JoinHandler implements JoinMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly checkIfUseCanJoin: CheckIfUseCanJoin;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: ISocket,
		checkIfUseCanJoin: CheckIfUseCanJoin
	) {
		this.eventEmitter = eventEmitter;
		this.logger = logger;
		this.socket = socket;
		this.checkIfUseCanJoin = checkIfUseCanJoin;
		this.eventEmitter.on(
			Commands.JOIN_GAME as unknown as string,
			(message: ClientMessage) => void this.handle(message)
		);
	}

	async handle(message: ClientMessage): Promise<void> {
		this.logger.info("JoinHandler");
		const joinMessage = new JoinGameMessage(message.data);
		const room = this.findRoom(joinMessage);

		if (!room) {
			this.socket.send(ServerErrorClientMessage.create("Room not found. Try reloading the list"));

			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

			this.socket.destroy();

			return;
		}

		if (room.ranked) {
			const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
			if (!(await this.checkIfUseCanJoin.check(playerInfoMessage, this.socket))) {
				return;
			}
		}

		if (room.password !== joinMessage.password) {
			this.socket.send(ServerErrorClientMessage.create("Wrong password"));
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
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
