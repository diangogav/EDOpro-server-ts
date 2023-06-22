import net, { Socket } from "net";
import { v4 as uuidv4 } from "uuid";

import { MessageHandler } from "../modules/messages/application/MessageHandler/MessageHandler";
import { ClientRemover } from "../modules/room/application/ClientRemover";
import { Logger } from "../modules/shared/logger/domain/Logger";

export class YGOClientSocket extends Socket {
	id?: string;
}

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly clientRemover: ClientRemover;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer();
		this.clientRemover = new ClientRemover(this.logger);
	}

	initialize(): void {
		this.server.listen(7711, () => {
			this.logger.info("Server listen in port 7711");
		});
		this.server.on("connection", (socket: Socket) => {
			const ygoClientSocket = socket as YGOClientSocket;
			ygoClientSocket.id = uuidv4();

			socket.on("data", (data) => {
				this.logger.info(data.toString("hex"));
				const messageHandler = new MessageHandler(data, socket, this.logger);
				messageHandler.read();
			});

			socket.on("close", () => {
				if (!ygoClientSocket.id) {
					return;
				}
				this.logger.error(`Client: ${ygoClientSocket.id} left`);
				this.clientRemover.run(ygoClientSocket);
			});

			socket.on("error", (error) => {
				this.logger.error(error);
			});
		});
	}
}
