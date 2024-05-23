import MercuryRoomList from "../../../mercury/room/infrastructure/MercuryRoomList";
import { YgoRoom } from "../../shared/room/domain/YgoRoom";
import RoomList from "../infrastructure/RoomList";

export class RoomFinder {
	run(socketId: string): YgoRoom | null {
		const rooms = [...RoomList.getRooms(), ...MercuryRoomList.getRooms()];
		let room: YgoRoom | null = null;
		for (const item of rooms) {
			const allClients = [...item.clients, ...item.spectators];
			const found = allClients.find((client) => client.socket.id === socketId);
			if (found) {
				room = item;
				break;
			}
		}

		return room;
	}
}
