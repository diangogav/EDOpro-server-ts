import { Room } from "./Room";

const rooms: Room[] = []

export default {
  addRoom(room: Room) {
    rooms.push(room)
  },

  getRooms(): Room[] {
    return rooms
  }
};