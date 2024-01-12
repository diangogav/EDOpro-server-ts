import { EventEmitter } from "stream";

import { PlayerInfoMessage } from "../../../modules/messages/client-to-server/PlayerInfoMessage";
import { Commands } from "../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../modules/messages/MessageProcessor";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { JoinMessageHandler } from "../../../modules/shared/room/domain/JoinMessageHandler";
import { YGOClientSocket } from "../../../socket-server/HostServer";
import { MercuryClient } from "../../client/domain/MercuryClient";
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
		this.logger.info(`Join Message: ${message.data.toString("hex")}`);

		const playerInfoMessage = new PlayerInfoMessage(message.previousMessage, message.data.length);
		this.logger.info(`name: ${playerInfoMessage.name}`);
		const joinMessage = new MercuryJoinGameMessage(message.data);
		this.logger.info(`version: ${joinMessage.version}`);

		if (joinMessage.version !== 4960) {
			this.socket.write(Buffer.from("0900020400000060130000", "hex"));

			return;
		}
		const messages = [message.previousRawMessage, message.raw];
		const room = this.createRoomIfNotExists(joinMessage.pass);
		const client = new MercuryClient({
			socket: this.socket,
			logger: this.logger,
			messages,
			name: playerInfoMessage.name,
		});
		room.addClient(client);

		if (!room.isCoreStarted) {
			room.startCore();
		}
	}

	private createRoomIfNotExists(name: string): MercuryRoom {
		const existingRoom = MercuryRoomList.findById(name);
		if (!existingRoom) {
			const room = MercuryRoom.create(name, this.logger);
			MercuryRoomList.addRoom(room);

			return room;
		}

		return existingRoom;
	}
}
