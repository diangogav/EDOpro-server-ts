import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
import { EventEmitter } from "stream";

import { MercuryGameCreatorHandler } from "../mercury/room/application/MercuryGameCreatorHandler";
import { MercuryJoinHandler } from "../mercury/room/application/MercuryJoinHandler";
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
		});
	}
}
