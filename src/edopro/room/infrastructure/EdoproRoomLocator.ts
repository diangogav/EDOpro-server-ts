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

	findById(id: number): Room | null {
		return RoomList.getRooms().find((room) => room.id === id) ?? null;
	}
}
