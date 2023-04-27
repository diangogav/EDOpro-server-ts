import express, { Express } from "express";

import { Logger } from "../modules/shared/logger/domain/Logger";
import { createDirectoryIfNotExists } from "../utils";
import { loadRoutes } from "./loadRoutes";

export class Server {
	private readonly app: Express;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
		this.app = express();
		this.loadRoutes();
	}

	async initialize(): Promise<void> {
		await createDirectoryIfNotExists("./config");
		this.app.listen(7722, () => {
			this.logger.info("Server listen in port 7722");
		});
	}

	private loadRoutes() {
		loadRoutes(this.app);
	}
}
