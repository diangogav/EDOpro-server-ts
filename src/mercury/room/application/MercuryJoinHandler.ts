import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../modules/messages/MessageProcessor";
import { VersionErrorClientMessage } from "../../../modules/messages/server-to-client/VersionErrorClientMessage";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { JoinMessageHandler } from "../../../modules/shared/room/domain/JoinMessageHandler";
import { DuelState } from "../../../modules/shared/room/domain/YgoRoom";
import { YGOClientSocket } from "../../../socket-server/HostServer";
import { MercuryClient } from "../../client/domain/MercuryClient";
import { mercuryConfig } from "../../config";
import { MercuryJoinGameMessage } from "../../messages/MercuryJoinGameMessage";
import { MercuryRoom } from "../domain/MercuryRoom";
import MercuryRoomList from "../infrastructure/MercuryRoomList";

export class MercuryJoinHandler implements JoinMessageHandler {
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
		this.logger.debug(`Join Message: ${message.data.toString("hex")}`);

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		this.logger.debug(`name: ${playerInfoMessage.name}`);
		const joinMessage = new MercuryJoinGameMessage(message.data);
		this.logger.info(`version: ${joinMessage.version}`);

		if (joinMessage.version !== mercuryConfig.version) {
			this.socket.write(VersionErrorClientMessage.create(mercuryConfig.version));

			return;
		}

		const messages = [message.previousRawMessage, message.raw];
		const room = this.createRoomIfNotExists(joinMessage.pass);

		if (room.duelState === DuelState.DUELING) {
			const spectator = new MercuryClient({
				socket: this.socket,
				logger: this.logger,
				messages: [],
				name: playerInfoMessage.name,
				position: room.playersCount,
				room,
			});
			room.addSpectator(spectator);

			return;
		}

		const client = new MercuryClient({
			socket: this.socket,
			logger: this.logger,
			messages,
			name: playerInfoMessage.name,
			position: room.playersCount,
			room,
		});

		room.addClient(client);

		if (!room.isCoreStarted) {
			room.startCore();
		}
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}

	private createRoomIfNotExists(name: string): MercuryRoom {
		const existingRoom = MercuryRoomList.findByName(name);
		if (!existingRoom) {
			const room = MercuryRoom.create(
				this.generateUniqueId(),
				name,
				this.logger,
				this.eventEmitter
			);
			MercuryRoomList.addRoom(room);
			room.waiting();

			return room;
		}

		return existingRoom;
	}
}
