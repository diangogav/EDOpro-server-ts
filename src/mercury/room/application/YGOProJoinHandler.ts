


import { EventEmitter } from "stream";

import { generateUniqueId } from "src/utils/generateUniqueId";

import { CheckIfUseCanJoin } from "@shared/user-auth/application/CheckIfUserCanJoin";
import { Commands } from "@shared/messages/Commands";
import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { JoinMessageHandler } from "@shared/room/domain/JoinMessageHandler";
import { ISocket } from "@shared/socket/domain/ISocket";
import { PlayerInfoMessage } from "@edopro/messages/client-to-server/PlayerInfoMessage";

import { YGOProRoom } from "../domain/YGOProRoom";
import YGOProRoomList from "../infrastructure/MercuryRoomList";
import { YGOProCtosJoinGame } from "ygopro-msg-encode";
import { MessageRepository } from "@shared/messages/MessageRepository";

export class YGOProJoinHandler implements JoinMessageHandler {
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly eventEmitter: EventEmitter;
	private readonly checkIfUserCanJoin: CheckIfUseCanJoin;
	private readonly messageRepository: MessageRepository;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: ISocket,
		checkIfUserCanJoin: CheckIfUseCanJoin,
		messageRepository: MessageRepository
	) {
		this.logger = logger.child({ file: "YGOProJoinHandler" });
		this.socket = socket;
		this.eventEmitter = eventEmitter;
		this.checkIfUserCanJoin = checkIfUserCanJoin;
		this.messageRepository = messageRepository;
		this.eventEmitter.on(
			Commands.JOIN_GAME as unknown as string,
			(message: ClientMessage) => void this.handleJoinGame(message)
		);
	}

	async handleJoinGame(message: ClientMessage): Promise<void> {
		this.logger.info("JOIN_GAME");

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const joinMessage = new YGOProCtosJoinGame().fromPayload(message.data);

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
	): YGOProRoom {
		const existingRoom = YGOProRoomList.findByName(name);
		if (!existingRoom) {
			const room = YGOProRoom.create(
				generateUniqueId(),
				name,
				this.logger,
				this.eventEmitter,
				playerInfo,
				socketId,
				this.messageRepository,
			);
			YGOProRoomList.addRoom(room);
			room.waiting();

			return room;
		}

		return existingRoom;
	}
}
