/* eslint-disable @typescript-eslint/no-floating-promises */
import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";

import { MessageEmitter } from "../modules/MessageEmitter";
import { DisconnectHandler } from "../modules/room/application/DisconnectHandler";
import { RecordMatch } from "../modules/room/application/RecordMatch";
import { RoomFinder } from "../modules/room/application/RoomFinder";
import { RedisRoomRepository } from "../modules/room/match/infrastructure/RedisRoomRepository";
import { container } from "../modules/shared/dependency-injection";
import { EventBus } from "../modules/shared/event-bus/EventBus";
import { Logger } from "../modules/shared/logger/domain/Logger";

export class YGOClientSocket extends Socket {
	id?: string;
	roomId?: number;
}

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly roomFinder: RoomFinder;
	private address?: string;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer({ keepAlive: true });
		this.roomFinder = new RoomFinder();
		this.registerSubscribers();
	}

	initialize(): void {
		this.server.listen(7911, () => {
			this.logger.info("Server listen in port 7911");
		});
		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
			const ygoClientSocket = socket as YGOClientSocket;
			ygoClientSocket.setKeepAlive(true, 1000);
			const messageEmitter = new MessageEmitter(this.logger, ygoClientSocket);
			ygoClientSocket.id = uuidv4();

			socket.on("data", (data: Buffer) => {
				this.logger.debug(`Incoming message: ${data.toString("hex")}`);
				messageEmitter.handleMessage(data);
			});

			socket.on("end", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in end event`);
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("close", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in close event`);
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("error", (_error) => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in error event`);
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});
		});
	}

	private registerSubscribers(): void {
		const eventBus = container.get(EventBus);

		eventBus.subscribe(RecordMatch.ListenTo, new RecordMatch(new RedisRoomRepository()));
	}
}
