import "reflect-metadata";
import "./modules/shared/error-handler/error-handler";

import { Server } from "./http-server/Server";
import { MercuryBanListLoader } from "./mercury/ban-list/infrastructure/MercuryBanListLoader";
import { BanListLoader } from "./modules/ban-list/infrastructure/BanListLoader";
import { SQLiteTypeORM } from "./modules/shared/db/postgres/infrastructure/SQLiteTypeORM";
import { Pino } from "./modules/shared/logger/infrastructure/Pino";
import { HostServer } from "./socket-server/HostServer";
import { MercuryServer } from "./socket-server/MercuryServer";
import WebSocketSingleton from "./web-socket-server/WebSocketSingleton";

void start();

async function start(): Promise<void> {
	const logger = new Pino();
	const server = new Server(logger);
	const mercuryServer = new MercuryServer(logger);
	const hostServer = new HostServer(logger);
	const database = new SQLiteTypeORM();
	const banListLoader = new BanListLoader();
	await banListLoader.loadDirectory("./banlists/evolution");
	// await BanListMemoryRepository.backup();
	await MercuryBanListLoader.load("./mercury/lflist.conf");
	await database.connect();
	await database.initialize();
	await server.initialize();
	WebSocketSingleton.getInstance();
	hostServer.initialize();
	mercuryServer.initialize();
}
