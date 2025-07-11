import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";
import { EventEmitter } from "stream";

import { config } from "../../../config";
import { Logger } from "../../../shared/logger/domain/Logger";
import { PlayerEnterClientMessage } from "../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { GameCreatorMessageHandler } from "../../../shared/room/domain/GameCreatorMessageHandler";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../messages/domain/Commands";
import { ServerInfoMessage } from "../../messages/domain/ServerInfoMessage";
import { ClientMessage } from "../../messages/MessageProcessor";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreatorHandler implements GameCreatorMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: ISocket;
	private readonly userAuth: UserAuth;
	private readonly HOST_CLIENT = 0x10;

	constructor(eventEmitter: EventEmitter, logger: Logger, socket: ISocket, userAuth: UserAuth) {
		this.eventEmitter = eventEmitter;
		this.logger = logger;
		this.socket = socket;
		this.userAuth = userAuth;
		this.eventEmitter.on(Commands.CREATE_GAME as unknown as string, (message: ClientMessage) => {
			void this.handle(message);
		});
	}

	async handle(message: ClientMessage): Promise<void> {
		this.logger.info("GameCreatorHandler");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const createGameMessage = new CreateGameMessage(message.data);

		if (!playerInfoMessage.password || !config.ranking.enabled) {
			this.create(createGameMessage, playerInfoMessage, null);

			return;
		}

		const user = await this.userAuth.run(playerInfoMessage);
		if (!(user instanceof UserProfile)) {
			this.socket.send(user as Buffer);
			this.socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

			return;
		}

		this.create(createGameMessage, playerInfoMessage, user.id);
	}

	private create(
		message: CreateGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		userId: string | null
	): void {
		const room = Room.createFromCreateGameMessage(
			message,
			playerInfoMessage,
			this.generateUniqueId(),
			this.eventEmitter,
			this.logger
		);

		room.waiting();

		const client = room.createHost(this.socket, playerInfoMessage.name, userId);
		RoomList.addRoom(room);
		this.socket.send(CreateGameClientMessage.create(room));
		this.socket.send(JoinGameClientMessage.createFromCreateGameMessage(message));
		this.socket.send(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		this.socket.send(PlayerChangeClientMessage.create({}));
		this.socket.send(TypeChangeClientMessage.create({ type: this.HOST_CLIENT }));

		if (room.ranked) {
			this.sendRankedMessage();

			return;
		}

		this.sendUnrankedMessage();
	}

	private sendRankedMessage(): void {
		this.socket.send(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		this.socket.send(
			ServerMessageClientMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS)
		);
		this.socket.send(
			ServerMessageClientMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION)
		);
	}

	private sendUnrankedMessage(): void {
		this.socket.send(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		this.socket.send(
			ServerMessageClientMessage.create(ServerInfoMessage.UN_RANKED_ROOM_CREATION_SUCCESS)
		);
		if (!config.ranking.enabled) {
			this.socket.send(
				ServerMessageClientMessage.create(ServerInfoMessage.UNAVAILABLE_RANKING_SYSTEM)
			);
		}

		this.socket.send(ServerMessageClientMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
}
