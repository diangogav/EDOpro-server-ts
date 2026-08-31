import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";
import { EventEmitter } from "stream";

import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { GameCreatorMessageHandler } from "../../../shared/room/domain/GameCreatorMessageHandler";
import { roomCreationNotice } from "../../../shared/room/domain/chat/RoomCreationNotice";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../shared/messages/Commands";
import { ClientMessage } from "../../../shared/messages/MessageProcessor";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreatorHandler implements GameCreatorMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly userAuth: UserAuth;
	private readonly roomId: number;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: ISocket,
		userAuth: UserAuth,
		roomId: number,
	) {
		this.eventEmitter = eventEmitter;
		this.logger = logger.child({ file: "GameCreatorHandler", roomId });
		this.socket = socket;
		this.userAuth = userAuth;
		this.roomId = roomId;
		this.eventEmitter.on(Commands.CREATE_GAME as unknown as string, (message: ClientMessage) => {
			void this.handleCreateGame(message);
		});
	}

	async handleCreateGame(message: ClientMessage): Promise<void> {
		this.logger.info("Handle");

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const createGameMessage = new CreateGameMessage(message.data);

		if (!playerInfoMessage.password || !config.ranking.enabled) {
			await this.create(createGameMessage, playerInfoMessage, null);

			return;
		}

		const user = await this.userAuth.run(playerInfoMessage);
		if (!(user instanceof UserProfile)) {
			this.socket.send(user as Buffer);
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

			return;
		}

		await this.create(createGameMessage, playerInfoMessage, user.id);
	}

	private async create(
		message: CreateGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		userId: string | null,
	): Promise<void> {
		const room = Room.createFromCreateGameMessage(
			message,
			playerInfoMessage,
			this.roomId,
			this.eventEmitter,
			this.logger,
		);

		room.waiting();

		const host = await room.createPlayer(this.socket, playerInfoMessage.name, userId);
		if (host?.host) {
			host.sendMessage(CreateGameClientMessage.create(room));
			host.sendMessage(JoinGameClientMessage.createFromCreateGameMessage(message));
			room.addPlayer(host);
			RoomList.addRoom(room);
		}

		this.sendRoomCreationNotice(room);
	}

	/**
	 * One-line, colored room-creation notice replacing the old three-clause
	 * WELCOME banner.
	 */
	private sendRoomCreationNotice(room: Room): void {
		this.socket.send(
			roomCreationNotice({ ranked: room.ranked, rankingEnabled: config.ranking.enabled }),
		);
	}
}
