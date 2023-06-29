import { type Room } from "../domain/Room";

const rooms: Room[] = [];

export default {
	addRoom(room: Room): void {
		rooms.push(room);
	},

	getRooms(): Room[] {
		return rooms;
	},

	deleteRoom(room: Room): void {
		room.clients.forEach((client) => {
			client.socket.destroy();
		});

		room.spectators.forEach((spectator) => {
			spectator.socket.destroy();
		});

		const index = rooms.findIndex((item) => item.id === room.id);
		if (index !== -1) {
			rooms.splice(index, 1);
		}
	},
};
