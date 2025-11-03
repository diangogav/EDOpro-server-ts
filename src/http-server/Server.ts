import express, { Express } from "express";
import { config } from "src/config";

import { Logger } from "../shared/logger/domain/Logger";
import { createDirectoryIfNotExists } from "../utils";
import { loadRoutes } from "./routes";

export class Server {
	private readonly app: Express;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
		this.app = express();
		this.app.use(express.json());
		loadRoutes(this.app, this.logger);
	}

	async initialize(): Promise<void> {
		await createDirectoryIfNotExists("./config");
		this.app.listen(config.servers.http.port, () => {
			this.logger.info(`Server listen in port ${config.servers.http.port}`);
		});
	}
}
