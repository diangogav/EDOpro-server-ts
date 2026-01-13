 
 

import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { generateUniqueId } from "src/utils/generateUniqueId";
import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../edopro/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../edopro/messages/domain/Commands";
import { ClientMessage } from "../../../edopro/messages/MessageProcessor";
import { Logger } from "../../../shared/logger/domain/Logger";
import { JoinMessageHandler } from "../../../shared/room/domain/JoinMessageHandler";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { MercuryJoinGameMessage } from "../../messages/MercuryJoinGameMessage";
import { MercuryRoom } from "../domain/MercuryRoom";
import MercuryRoomList from "../infrastructure/MercuryRoomList";

export class MercuryJoinHandler implements JoinMessageHandler {
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly eventEmitter: EventEmitter;
	private readonly checkIfUserCanJoin: CheckIfUseCanJoin;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: ISocket,
		checkIfUserCanJoin: CheckIfUseCanJoin
	) {
		this.logger = logger.child({ file: "MercuryJoinHandler" });
		this.socket = socket;
		this.eventEmitter = eventEmitter;
		this.checkIfUserCanJoin = checkIfUserCanJoin;
		this.eventEmitter.on(
			Commands.JOIN_GAME as unknown as string,
			(message: ClientMessage) => void this.handle(message)
		);
	}

	async handle(message: ClientMessage): Promise<void> {
		this.logger.info("JOIN_GAME");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new MercuryJoinGameMessage(message.data);

		const room = this.createRoomIfNotExists(
			joinMessage.pass,
			playerInfoMessage,
			this.socket.id as string
		);

		if (room.ranked && !(await this.checkIfUserCanJoin.check(playerInfoMessage, this.socket))) {
			return;
		}

		room.emit("JOIN", message, this.socket);
	}

	private createRoomIfNotExists(
		name: string,
		playerInfo: PlayerInfoMessage,
		socketId: string
	): MercuryRoom {
		const existingRoom = MercuryRoomList.findByName(name);
		if (!existingRoom) {
			const room = MercuryRoom.create(
				generateUniqueId(),
				name,
				this.logger,
				this.eventEmitter,
				playerInfo,
				socketId
			);
			MercuryRoomList.addRoom(room);
			room.waiting();

			return room;
		}

		return existingRoom;
	}
}
