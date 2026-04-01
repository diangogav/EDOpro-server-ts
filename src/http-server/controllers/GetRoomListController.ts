import { Request, Response } from "express";

import RoomList from "../../edopro/room/infrastructure/RoomList";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

export class GetRoomListController {
	run(_req: Request, response: Response): void {
		const rooms = RoomList.getRooms().map((room) => room.toPresentation());
		const ygoproRooms = YGOProRoomList.getRooms().map((room) => room.toPresentation());
		response.status(200).json({ rooms: [...ygoproRooms, ...rooms] });
	}
}
