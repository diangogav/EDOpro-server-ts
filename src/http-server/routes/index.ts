/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Express } from "express";

import { config } from "../../config";
import { Logger } from "../../modules/shared/logger/domain/Logger";
import { CreateRoomController } from "../controllers/CreateRoomController";
import { GetRoomListController } from "../controllers/GetRoomListController";
import { SyncRepositoriesController } from "../controllers/SyncRepositoriesController";

export function loadRoutes(app: Express, logger: Logger): void {
	app.get("/api/getrooms", (req, res) => new GetRoomListController().run(req, res));
	app.post("/api/room", (req, res) => new CreateRoomController(logger).run(req, res));
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	app.post("/api/admin/sync", async (req, res) => {
		const adminApiKey = req.headers["admin-api-key"];
		if (adminApiKey !== config.adminApiKey) {
			return res.status(401).json({});
		}
		await new SyncRepositoriesController(logger).run(req, res);
	});
	app.get("/api/admin/sync", (req, res) => {
		const adminApiKey = req.query["admin-api-key"];
		if (adminApiKey !== config.adminApiKey) {
			return res.status(401).json({});
		}
		void new SyncRepositoriesController(logger).run(req, res);
	});
}
