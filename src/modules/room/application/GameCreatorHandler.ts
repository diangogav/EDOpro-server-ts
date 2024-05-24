import { EventEmitter } from "stream";

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
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { Logger } from "../../shared/logger/domain/Logger";
import { GameCreatorMessageHandler } from "../../shared/room/domain/GameCreatorMessageHandler";
import { YGOClientSocket } from "../../shared/socket/domain/YGOClientSocket";
import { Rank } from "../../shared/value-objects/Rank";
import { UserFinder } from "../../user/application/UserFinder";
import { User } from "../../user/domain/User";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreatorHandler implements GameCreatorMessageHandler {
	private readonly eventEmitter: EventEmitter;
	private readonly logger: Logger;
	private readonly socket: YGOClientSocket;
	private readonly userFinder: UserFinder;
	private readonly HOST_CLIENT = 0x10;

	constructor(
		eventEmitter: EventEmitter,
		logger: Logger,
		socket: YGOClientSocket,
		userFinder: UserFinder
	) {
		this.eventEmitter = eventEmitter;
		this.logger = logger;
		this.socket = socket;
		this.userFinder = userFinder;
		this.eventEmitter.on(Commands.CREATE_GAME as unknown as string, (message: ClientMessage) => {
			void this.handle(message);
		});
	}

	async handle(message: ClientMessage): Promise<void> {
		this.logger.info("GameCreatorHandler");
		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		const createGameMessage = new CreateGameMessage(message.data);

		if (!playerInfoMessage.password) {
			this.create(createGameMessage, playerInfoMessage, []);

			return;
		}

		const user = await this.userFinder.run(playerInfoMessage);

		if (!(user instanceof User)) {
			this.socket.write(user as Buffer);
			this.socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

			return;
		}

		this.create(createGameMessage, playerInfoMessage, user.ranks);
	}

	private create(
		message: CreateGameMessage,
		playerInfoMessage: PlayerInfoMessage,
		ranks: Rank[]
	): void {
		const room = Room.createFromCreateGameMessage(
			message,
			playerInfoMessage,
			this.generateUniqueId(),
			this.eventEmitter,
			this.logger
		);

		room.waiting();

		const client = room.createHost(this.socket, playerInfoMessage.name, ranks);
		RoomList.addRoom(room);
		room.createMatch();

		this.socket.write(CreateGameClientMessage.create(room));
		this.socket.write(JoinGameClientMessage.createFromCreateGameMessage(message));
		this.socket.write(PlayerEnterClientMessage.create(playerInfoMessage.name, client.position));
		this.socket.write(PlayerChangeClientMessage.create({}));
		this.socket.write(TypeChangeClientMessage.create({ type: this.HOST_CLIENT }));

		if (room.ranked) {
			this.sendRankedMessage();

			return;
		}

		this.sendUnrankedMessage();
	}

	private sendRankedMessage(): void {
		this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		this.socket.write(
			ServerMessageClientMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS)
		);
		this.socket.write(
			ServerMessageClientMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION)
		);
	}

	private sendUnrankedMessage(): void {
		this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		this.socket.write(
			ServerMessageClientMessage.create(ServerInfoMessage.UNRANKED_ROOM_CREATION_SUCCESS)
		);
		this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
}
