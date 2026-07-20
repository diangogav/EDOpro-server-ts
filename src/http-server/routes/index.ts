import { Express } from "express";

import { TicketRepository } from "../../shared/ticket/domain/TicketRepository";
import { Logger } from "../../shared/logger/domain/Logger";
import { CancelMatchmakingController } from "../controllers/CancelMatchmakingController";
import { CreateRoomController } from "../controllers/CreateRoomController";
import { EnqueueMatchmakingController } from "../controllers/EnqueueMatchmakingController";
import { MatchmakingStatusController } from "../controllers/MatchmakingStatusController";
import { GetBanListDetailController } from "../controllers/GetBanListDetailController";
import { GetBanListsController } from "../controllers/GetBanListsController";
import { GetDatabaseCardsController } from "../controllers/GetDatabaseCardsController";
import { GetDatabasesController } from "../controllers/GetDatabasesController";
import { GetResourceVersionController } from "../controllers/GetResourceVersionController";
import { GetRoomListController } from "../controllers/GetRoomListController";
import { InspectPageController } from "../controllers/InspectPageController";
import { RoomListController } from "../controllers/RoomListController";
import { SearchCardsController } from "../controllers/SearchCardsController";
import { ServerMessagesController } from "../controllers/ServerMessagesController";
import { AuthAdminMiddleware } from "../middlewares/AuthAdminMiddleware";
import { RateLimitMiddleware } from "../middlewares/RateLimitMiddleware";

export function loadRoutes(app: Express, logger: Logger, tickets: TicketRepository): void {
	app.get("/", (req, res) => new InspectPageController().run(req, res));

	app.get("/api/getrooms", (req, res) => new GetRoomListController().run(req, res));

	app.post("/api/matchmaking/queue", (req, res) =>
		new EnqueueMatchmakingController(logger, tickets).run(req, res),
	);

	app.get("/api/matchmaking/status", (req, res) => new MatchmakingStatusController().run(req, res));

	app.delete("/api/matchmaking/queue", (req, res) =>
		new CancelMatchmakingController().run(req, res),
	);

	app.get("/api/rooms", (req, res) => new RoomListController().run(req, res));

	app.post("/api/room", (req, res) => new CreateRoomController(logger).run(req, res));

	app.get("/api/banlists", RateLimitMiddleware, (req, res) =>
		new GetBanListsController().run(req, res),
	);

	app.get("/api/banlists/:engine/:name", RateLimitMiddleware, async (req, res) => {
		await new GetBanListDetailController().run(req, res);
	});

	app.get("/api/databases", RateLimitMiddleware, async (req, res) => {
		await new GetDatabasesController().run(req, res);
	});

	app.get("/api/resources/version", RateLimitMiddleware, (req, res) =>
		new GetResourceVersionController().run(req, res),
	);

	app.get("/api/databases/cards", RateLimitMiddleware, async (req, res) => {
		await new GetDatabaseCardsController().run(req, res);
	});

	app.get("/api/cards", RateLimitMiddleware, async (req, res) => {
		await new SearchCardsController().run(req, res);
	});

	app.use("/api/admin", AuthAdminMiddleware);

	app.post("/api/admin/message", async (req, res) => {
		await new ServerMessagesController().run(req, res);
	});
}
