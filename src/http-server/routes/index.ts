import { Express } from "express";

import { GetRoomListController } from "../controllers/GetRoomListController";

export function loadRoutes(app: Express): void {
	app.get("/api/getrooms", (req, res) => new GetRoomListController().run(req, res));
}
