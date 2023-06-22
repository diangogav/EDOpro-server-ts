import { YGOClientSocket } from "../../../socket-server/HostServer";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { Logger } from "../../shared/logger/domain/Logger";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class ClientRemover {
	private readonly STATUS = 0xb;

	constructor(private readonly logger: Logger) {}

	run(socket: YGOClientSocket): void {
		const socketId = socket.id;
		if (!socketId) {
			return;
		}

		const room = this.findClient(socketId);
		if (!room) {
			return;
		}

		const client = room.clients.find((client) => client.socket.id === socketId);

		room.removePlayer(socketId);

		if (!client) {
			return;
		}

		const status = (client.position << 4) | this.STATUS;
		const message = PlayerChangeClientMessage.create({ status });

		room.clients.forEach((client) => {
			this.logger.debug(`sending to position ${client.position}: ${message.toString("hex")}`);
			client.socket.write(message);
		});
	}

	private findClient(socketId: string): Room | null {
		const rooms = RoomList.getRooms();
		let room: Room | null = null;
		for (const item of rooms) {
			const found = item.clients.find((client) => client.socket.id === socketId);
			if (found) {
				room = item;
				break;
			}
		}

		return room;
	}
}
