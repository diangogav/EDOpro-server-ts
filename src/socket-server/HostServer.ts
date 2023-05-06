import net, { Socket } from "net";

import { MessageHandler } from "../modules/messages/application/MessageHandler/MessageHandler";
import { Logger } from "../modules/shared/logger/domain/Logger";

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
			socket.on("data", (data) => {
				this.logger.debug(data.toString("hex"));
				const messageHandler = new MessageHandler(data, socket);
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
