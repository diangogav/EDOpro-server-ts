/* eslint-disable @typescript-eslint/no-floating-promises */
import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
import { UserFinder } from "src/shared/user/application/UserFinder";
import { UserRedisRepository } from "src/shared/user/infrastructure/UserRedisRepository";
import { EventEmitter } from "stream";

import { MessageEmitter } from "../edopro/MessageEmitter";
import { GameCreatorHandler } from "../edopro/room/application/GameCreatorHandler";
import { JoinHandler } from "../edopro/room/application/JoinHandler";
import { BasicStatsCalculator } from "../edopro/stats/basic/application/BasicStatsCalculator";
import { container } from "../shared/dependency-injection";
import { EventBus } from "../shared/event-bus/EventBus";
import { Logger } from "../shared/logger/domain/Logger";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { RedisRoomRepository } from "../shared/room/domain/match/infrastructure/RedisRoomRepository";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";

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
			const tcpClientSocket = new TCPClientSocket(socket);
			const eventEmitter = new EventEmitter();
			const gameCreatorHandler = new GameCreatorHandler(
				eventEmitter,
				this.logger,
				tcpClientSocket,
				new UserFinder(new UserRedisRepository())
			);
			const joinHandler = new JoinHandler(eventEmitter, this.logger, tcpClientSocket);
			const messageEmitter = new MessageEmitter(
				this.logger,
				eventEmitter,
				gameCreatorHandler,
				joinHandler
			);
			tcpClientSocket.id = uuidv4();

			socket.on("data", (data: Buffer) => {
				this.logger.debug(`Incoming message: ${data.toString("hex")}`);
				messageEmitter.handleMessage(data);
			});

			socket.on("end", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in end event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("close", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in close event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("error", (_error) => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in error event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});
		});
	}

	private registerSubscribers(): void {
		const eventBus = container.get(EventBus);

		eventBus.subscribe(
			BasicStatsCalculator.ListenTo,
			new BasicStatsCalculator(new RedisRoomRepository())
		);
	}
}
