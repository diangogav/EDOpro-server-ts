import net, { Socket } from "net";
import { v4 as uuidv4 } from "uuid";

import { MessageHandler } from "../modules/messages/application/MessageHandler/MessageHandler";
import { ClientRemover } from "../modules/room/application/ClientRemover";
import { RoomFinder } from "../modules/room/application/RoomFinder";
import { Logger } from "../modules/shared/logger/domain/Logger";
import ReconnectingPlayers from "../modules/shared/ReconnectingPlayers";

export class YGOClientSocket extends Socket {
	id?: string;
}

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly clientRemover: ClientRemover;
	private readonly roomFinder: RoomFinder;
	private address?: string;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer();
		this.clientRemover = new ClientRemover(this.logger);
		this.roomFinder = new RoomFinder();
	}

	initialize(): void {
		this.server.listen(7711, () => {
			this.logger.info("Server listen in port 7711");
		});
		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
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

				const room = this.roomFinder.run(ygoClientSocket.id);
				if (!room) {
					return;
				}

				const player = room.clients.find((client) => client.socket.id === ygoClientSocket.id);

				if (!player) {
					// remove spectator
					return;
				}

				// this.reconnecting.push(ygoClientSocket);
				if (this.address) {
					this.logger.error(`Saving player for reconnection: ${this.address}`);
					ReconnectingPlayers.add({
						address: this.address,
						socketId: ygoClientSocket.id,
						position: player.position,
					});
				}
			});

			socket.on("error", (error) => {
				this.logger.error(error);
			});
		});
	}
}
