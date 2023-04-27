import { Express, Request, Response } from "express";

import RoomList from "../modules/room/infrastructure/RoomList";

export function loadRoutes(app: Express): void {
	app.get("/api/getrooms", (req: Request, response: Response) => {
		const rooms = RoomList.getRooms().map((room) => room.toPresentation());
		response.status(200).json({ rooms });
	});
}
