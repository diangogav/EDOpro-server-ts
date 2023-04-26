import express, { Express, Request, Response } from "express";

import RoomList from "./modules/room/infrastructure/RoomList";
import { Logger } from "./modules/shared/logger/domain/Logger";
import { createDirectoryIfNotExists } from "./utils";

export class Server {
	private readonly app: Express;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
		this.app = express();
		this.app.get("/api/getrooms", (req: Request, response: Response) => {
			const rooms = RoomList.getRooms().map((room) => room.toPresentation());
			response.status(200).json({ rooms });
		});
	}

	async initialize(): Promise<void> {
		await createDirectoryIfNotExists("./config");
		this.app.listen(7722, () => {
			this.logger.info("Server listen in port 7722");
		});
	}
}
