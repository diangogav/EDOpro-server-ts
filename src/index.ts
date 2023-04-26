import { HostServer } from "./HostServer";
import { Winston } from "./modules/shared/logger/infrastructure/Winston";
import { Server } from "./Server";

void start();

async function start(): Promise<void> {
	const server = new Server(new Winston());
	const hostServer = new HostServer(new Winston());
	await server.initialize();
	hostServer.initialize();
}
