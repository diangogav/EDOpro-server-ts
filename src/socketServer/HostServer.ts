/* eslint-disable no-console */
import net, { Socket } from "net";

import { PlayerInfoMessage } from "../modules/messages/client-to-server/PlayerInfoMessage";
import { ClientToServerMessageFactory } from "../modules/messages/domain/ClientToServerMessageFactory";
import { GameCreator } from "../modules/room/application/GameCreator";
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
				const factory = new ClientToServerMessageFactory();
				const message = factory.get(data);
				if (!(message instanceof PlayerInfoMessage)) {
					return;
				}

				const gameCreator = new GameCreator(socket);
				gameCreator.run(data, message.name);
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
