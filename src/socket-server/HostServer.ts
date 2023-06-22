import net, { Socket } from "net";

import { MessageHandler } from "../modules/messages/application/MessageHandler/MessageHandler";
import { Logger } from "../modules/shared/logger/domain/Logger";

export class YGOClientSocket extends Socket {
	id?: string;
}

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer();
	}

	initialize(): void {
		this.server.listen(7711, () => {
			this.logger.info("Server listen in port 7711");
		});
		this.server.on("connection", (socket: Socket) => {
			const ygoClientSocket = socket as YGOClientSocket;
			ygoClientSocket.id = Math.random().toString();

			socket.on("data", (data) => {
				this.logger.info(data.toString("hex"));
				const messageHandler = new MessageHandler(data, socket, this.logger);
				messageHandler.read();
			});

			socket.on("close", () => {
				this.logger.info("socket close");
			});

			socket.on("error", (error) => {
				this.logger.error(error);
			});
		});
	}
}
