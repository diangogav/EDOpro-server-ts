/* eslint-disable @typescript-eslint/no-floating-promises */
import net, { Socket } from "net";
import { EventEmitter } from "stream";
import { v4 as uuidv4 } from "uuid";

import { MessageEmitter } from "../modules/MessageEmitter";
import { MercuryJoinHandler } from "../modules/room/application/mercury/MercuryJoinHandler";
import { RecordMatch } from "../modules/room/application/RecordMatch";
import { RoomFinder } from "../modules/room/application/RoomFinder";
import { RedisRoomRepository } from "../modules/room/match/infrastructure/RedisRoomRepository";
import { container } from "../modules/shared/dependency-injection";
import { EventBus } from "../modules/shared/event-bus/EventBus";
import { Logger } from "../modules/shared/logger/domain/Logger";
import { YGOClientSocket } from "./HostServer";

export class ClassicServer {
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
		this.server.listen(7933, () => {
			this.logger.info("Server listen in port 7933");
		});
		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
			const eventEmitter = new EventEmitter();
			const ygoClientSocket = socket as YGOClientSocket;
			ygoClientSocket.setKeepAlive(true, 1000);
			new MercuryJoinHandler(eventEmitter, this.logger, ygoClientSocket);
			const messageEmitter = new MessageEmitter(this.logger, eventEmitter);
			ygoClientSocket.id = uuidv4();

			socket.on("data", (data: Buffer) => {
				this.logger.debug(`Incoming data: ${data.toString("hex")}`);
				messageEmitter.handleMessage(data);
			});

			// socket.on("end", () => {});

			// socket.on("close", () => {});

			// socket.on("error", (_error) => {});
		});
	}

	private registerSubscribers(): void {
		const eventBus = container.get(EventBus);

		eventBus.subscribe(RecordMatch.ListenTo, new RecordMatch(new RedisRoomRepository()));
	}
}
