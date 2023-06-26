import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { Logger } from "../../shared/logger/domain/Logger";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class ClientRemover {
	private readonly STATUS = 0xb;

	constructor(private readonly logger: Logger) {}

	run(room: Room, socketId: string): void {
		const client = room.clients.find((client) => client.socket.id === socketId);

		room.removePlayer(socketId);

		if (!client) {
			return;
		}

		if (client.host) {
			RoomList.deleteRoom(room);

			return;
		}

		const status = (client.position << 4) | this.STATUS;
		const message = PlayerChangeClientMessage.create({ status });

		room.clients.forEach((client) => {
			this.logger.debug(`sending to position ${client.position}: ${message.toString("hex")}`);
			client.socket.write(message);
		});
	}
}
