import { type Room } from "../domain/Room";

const rooms: Room[] = [];

export default {
	addRoom(room: Room): void {
		rooms.push(room);
	},

	getRooms(): Room[] {
		return rooms;
	},
};
