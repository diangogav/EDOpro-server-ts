import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
import { EventEmitter } from "stream";

import { MercuryGameCreatorHandler } from "../mercury/room/application/MercuryGameCreatorHandler";
import { MercuryJoinHandler } from "../mercury/room/application/MercuryJoinHandler";
import { MercuryRoom } from "../mercury/room/domain/MercuryRoom";
import MercuryRoomList from "../mercury/room/infrastructure/MercuryRoomList";
import { MessageEmitter } from "../modules/MessageEmitter";
import { Logger } from "../modules/shared/logger/domain/Logger";
import { YGOClientSocket } from "./HostServer";

export class MercuryServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private address?: string;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer({ keepAlive: true });
	}

	initialize(): void {
		this.server.listen(7711, () => {
			this.logger.info("Mercury server listen in port 7711");
		});

		this.server.on("connection", (socket: Socket) => {
			this.logger.info("Client connected to Mercury server!!");
			this.address = socket.remoteAddress;
			const ygoClientSocket = socket as YGOClientSocket;
			ygoClientSocket.setKeepAlive(true, 1000);
			const eventEmitter = new EventEmitter();
			const gameCreatorHandler = new MercuryGameCreatorHandler(eventEmitter, this.logger);
			const joinHandler = new MercuryJoinHandler(eventEmitter, this.logger, ygoClientSocket);
			const messageEmitter = new MessageEmitter(
				this.logger,
				ygoClientSocket,
				eventEmitter,
				gameCreatorHandler,
				joinHandler
			);
			ygoClientSocket.id = uuidv4();
			socket.on("data", (data: Buffer) => {
				this.logger.info(`Incoming message handle by Mercury Server: ${data.toString("hex")}`);
				messageEmitter.handleMessage(data);
			});

			socket.on("end", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in end event`);
				const rooms = MercuryRoomList.getRooms();
				let room: MercuryRoom | null = null;
				for (const item of rooms) {
					const found = item.clients.find((client) => client.socket.id === ygoClientSocket.id);
					if (found) {
						room = item;
						break;
					}
				}

				if (!room) {
					return;
				}

				const player = room.clients.find((client) => client.socket.id === ygoClientSocket.id);

				if (!player) {
					return;
				}

				player.destroy();
				room.removePlayer(player);
			});

			socket.on("close", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in close event`);
			});

			socket.on("error", (_error) => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in error event`);
			});
		});
	}
}
