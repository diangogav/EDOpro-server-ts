import { EventEmitter } from "stream";
import { Logger } from "../../../shared/logger/domain/Logger";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Commands } from "../../messages/domain/Commands";
import { ClientMessage } from "../../messages/MessageProcessor";
import RoomList from "../infrastructure/RoomList";
import { Client } from "../../client/domain/Client";
import { TokenIndex } from "../../../shared/room/domain/TokenIndex";

export class ExpressReconnectHandler {
	constructor(
		private readonly eventEmitter: EventEmitter,
		private readonly logger: Logger,
		private readonly socket: ISocket
	) {
		this.eventEmitter.on(
			Commands.RECONNECT as unknown as string,
			(message: ClientMessage) => void this.handle(message)
		);
	}

	async handle(message: ClientMessage): Promise<void> {
		this.logger.info("Express reconnect handle started");
		const token = message.data.toString("utf8");
		this.logger.info(`Checking token: ${token}`);

		const entry = TokenIndex.getInstance().find(token);
		if (entry && entry.client instanceof Client) {
			const player = entry.client as Client;
			this.logger.info(`MATCH! Found player ${player.name} in room ${entry.roomId}`);
			
			const room = RoomList.getRooms().find(r => r.id === entry.roomId);
			if (room) {
				room.emit("EXPRESS_RECONNECT", message, this.socket);
				return;
			}
		}

		this.logger.info(`FAILED: No player found for token: ${token}`);
		const type = Buffer.from([0xfd]);
		const status = Buffer.from([0x01]);
		const data = Buffer.concat([type, status]);
		const size = Buffer.alloc(2);
		size.writeUint16LE(data.length);
		this.socket.send(Buffer.concat([size, data]));
		this.socket.destroy();
	}
}
