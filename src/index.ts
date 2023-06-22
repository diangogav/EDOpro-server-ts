import { Server } from "./http-server/Server";
import { Pino } from "./modules/shared/logger/infrastructure/Pino";
import { HostServer } from "./socket-server/HostServer";

void start();

async function start(): Promise<void> {
	const server = new Server(new Pino());
	const hostServer = new HostServer(new Pino());
	await server.initialize();
	hostServer.initialize();
}
