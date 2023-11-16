import "reflect-metadata";
import "./modules/shared/error-handler/error-handler";

import { Server } from "./http-server/Server";
import { BanListLoader } from "./modules/ban-list/infrastructure/BanListLoader";
import { SQLiteTypeORM } from "./modules/shared/db/postgres/infrastructure/SQLiteTypeORM";
import { Pino } from "./modules/shared/logger/infrastructure/Pino";
import { HostServer } from "./socket-server/HostServer";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("newrelic");

void start();

async function start(): Promise<void> {
	const logger = new Pino();
	const server = new Server(logger);
	const hostServer = new HostServer(logger);
	const database = new SQLiteTypeORM();
	const banListLoader = new BanListLoader();
	await banListLoader.loadDirectory("./banlists");
	await database.connect();
	await database.initialize();
	await server.initialize();
	WebSocketSingleton.getInstance();
	hostServer.initialize();
}
