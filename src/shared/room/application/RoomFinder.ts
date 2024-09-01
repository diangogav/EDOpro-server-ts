import RoomList from "../../../edopro/room/infrastructure/RoomList";
import MercuryRoomList from "../../../mercury/room/infrastructure/MercuryRoomList";
import { YgoRoom } from "../domain/YgoRoom";

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

		if (!room) {
			const mercuryRooms = MercuryRoomList.getRooms();

			return mercuryRooms.find((mercuryRoom) => mercuryRoom.createdBySocketId === socketId) ?? null;
		}

		return room;
	}
}
