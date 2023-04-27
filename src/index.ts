import { Server } from "./http-server/Server";
import { Winston } from "./modules/shared/logger/infrastructure/Winston";
import { HostServer } from "./socket-server/HostServer";

void start();

async function start(): Promise<void> {
	const server = new Server(new Winston());
	const hostServer = new HostServer(new Winston());
	await server.initialize();
	hostServer.initialize();
}
