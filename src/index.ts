import "reflect-metadata";

import { Server } from "./http-server/Server";
import { SQLiteTypeORM } from "./modules/shared/db/postgres/infrastructure/SQLiteTypeORM";
import { Redis } from "./modules/shared/db/redis/infrastructure/Redis";
import { Pino } from "./modules/shared/logger/infrastructure/Pino";
import { HostServer } from "./socket-server/HostServer";

void start();

async function start(): Promise<void> {
	const logger = new Pino();
	const server = new Server(logger);
	const hostServer = new HostServer(logger);
	const database = new SQLiteTypeORM();
	const redis = Redis.getInstance();
	await database.connect();
	await database.initialize();
	await redis.connect();
	await server.initialize();
	hostServer.initialize();
}
