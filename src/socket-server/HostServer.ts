/* eslint-disable @typescript-eslint/no-floating-promises */
import net, { Socket } from "net";
import { v4 as uuidv4 } from "uuid";

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
		this.server = net.createServer();
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
			const messageEmitter = new MessageEmitter(this.logger, ygoClientSocket);
			ygoClientSocket.id = uuidv4();

			socket.on("data", (data: Buffer) => {
				messageEmitter.handleMessage(data);
			});

			socket.on("close", () => {
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("error", (_error) => {
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
