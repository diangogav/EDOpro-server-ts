import { Request, Response } from "express";

import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";

export class RoomListController {
	run(req: Request, res: Response): void {
		let rooms = YGOProRoomList.getRooms();

		const { status, open, mode } = req.query;

		if (typeof status === "string") {
			const allowed = new Set(status.split(",").map((s) => s.trim()));
			rooms = rooms.filter((room) => allowed.has(room.duelState));
		}

		if (typeof open === "string") {
			const isOpen = open === "true";
			rooms = rooms.filter((room) =>
				isOpen ? room.password.length === 0 : room.password.length > 0,
			);
		}

		if (typeof mode === "string") {
			const modeNum = Number(mode);
			if (!Number.isNaN(modeNum)) {
				rooms = rooms.filter((room) => room.hostInfo.mode === modeNum);
			}
		}

		res.status(200).json({
			rooms: rooms.map((room) => room.toRoomListDTO()),
		});
	}
}
