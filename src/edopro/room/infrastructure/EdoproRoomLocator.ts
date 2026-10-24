import { RoomLocator } from "@shared/room/domain/RoomLocator";

import { Room } from "../domain/Room";
import RoomList from "./RoomList";

export class EdoproRoomLocator implements RoomLocator {
	findBySocketId(socketId: string): Room | null {
		return (
			RoomList.getRooms().find((room) =>
				[...room.players, ...room.spectators].some((client) => client.socket.id === socketId),
			) ?? null
		);
	}
}
