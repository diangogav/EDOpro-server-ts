import { MercuryRoom } from "../domain/MercuryRoom";

const rooms: MercuryRoom[] = [];

export default {
	addRoom(room: MercuryRoom): void {
		rooms.push(room);
	},

	getRooms(): MercuryRoom[] {
		return rooms;
	},

	findById(id: string): MercuryRoom | null {
		return rooms.find((room) => room.id === id) ?? null;
	},

	deleteRoom(_room: MercuryRoom): void {
		// room.destroy();
		// const index = rooms.findIndex((item) => item.id === room.id);
		// if (index !== -1) {
		// 	rooms.splice(index, 1);
		// }
	},
};
