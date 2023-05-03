import { Request, Response } from "express";

import RoomList from "../../modules/room/infrastructure/RoomList";

export class GetRoomListController {
	run(_req: Request, response: Response): void {
		const rooms = RoomList.getRooms().map((room) => room.toPresentation());
		response.status(200).json({ rooms });
	}
}
