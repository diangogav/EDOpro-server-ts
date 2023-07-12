import "reflect-metadata";

import { Server } from "./http-server/Server";
import { SQLiteTypeORM } from "./modules/shared/db/postgres/infrastructure/SQLiteTypeORM";
import { Pino } from "./modules/shared/logger/infrastructure/Pino";
import { HostServer } from "./socket-server/HostServer";

void start();

async function start(): Promise<void> {
	const server = new Server(new Pino());
	const hostServer = new HostServer(new Pino());
	const database = new SQLiteTypeORM();
	await database.connect();
	await database.initialize();
	await server.initialize();
	hostServer.initialize();
}
