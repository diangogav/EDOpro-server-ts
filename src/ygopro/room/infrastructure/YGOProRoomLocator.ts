import { RoomLocator } from "@shared/room/domain/RoomLocator";

import { YGOProRoom } from "../domain/YGOProRoom";
import YGOProRoomList from "./YGOProRoomList";

/**
 * Looks for the socket among the room clients first, then falls back to the
 * room it created, which covers a creator that has not joined yet.
 */
export class YGOProRoomLocator implements RoomLocator {
	findBySocketId(socketId: string): YGOProRoom | null {
		const rooms = YGOProRoomList.getRooms();
		const joined = rooms.find((room) =>
			[...room.players, ...room.spectators].some((client) => client.socket.id === socketId),
		);

		return joined ?? rooms.find((room) => room.createdBySocketId === socketId) ?? null;
	}
}
