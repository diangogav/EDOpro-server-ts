import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class RoomFinder {
	run(socketId: string): Room | null {
		const rooms = RoomList.getRooms();
		let room: Room | null = null;
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
