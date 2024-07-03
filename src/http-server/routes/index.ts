/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
import { Express } from "express";

import { Logger } from "../../modules/shared/logger/domain/Logger";
import { CreateRoomController } from "../controllers/CreateRoomController";
import { GetRoomListController } from "../controllers/GetRoomListController";
import { SendMessageToAllRooms } from "../controllers/SendMessageToAllRooms";
import { SyncRepositoriesController } from "../controllers/SyncRepositoriesController";
import { AuthMiddleware } from "../middlewares/AuthMiddleware";

export function loadRoutes(app: Express, logger: Logger): void {
	app.get("/api/getrooms", (req, res) => new GetRoomListController().run(req, res));

	app.post("/api/room", (req, res) => new CreateRoomController(logger).run(req, res));

	app.use("/api/admin/*", AuthMiddleware);

	app.post("/api/admin/sync", (req, res) => {
		void new SyncRepositoriesController(logger).run(req, res);
	});

	app.get("/api/admin/sync", (req, res) => {
		void new SyncRepositoriesController(logger).run(req, res);
	});
	// eslint-disable-next-line @typescript-eslint/no-misused-promises
	app.post("/api/admin/message", async (req, res) => {
		await new SendMessageToAllRooms(logger).run(req, res);
	});
}
