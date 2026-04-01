import { YGOProRoom } from "../domain/YGOProRoom";

const rooms: YGOProRoom[] = [];

export default {
	addRoom(room: YGOProRoom): void {
		rooms.push(room);
	},

	getRooms(): YGOProRoom[] {
		return rooms;
	},

	findByName(name: string): YGOProRoom | null {
		return rooms.find((room) => room.name === name) ?? null;
	},

	findById(id: number): YGOProRoom | null {
		return rooms.find((room) => room.id === id) ?? null;
	},

	deleteRoom(room: YGOProRoom): void {
		const index = rooms.findIndex((item) => item.id === room.id);
		if (index !== -1) {
			rooms.splice(index, 1);
		}
	},
};
