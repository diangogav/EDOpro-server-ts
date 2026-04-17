import { randomUUID as uuidv4 } from "crypto";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "src/config";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { EventEmitter } from "stream";

import { MessageEmitter } from "../edopro/MessageEmitter";
import { Logger } from "../shared/logger/domain/Logger";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { YGOProGameCreatorHandler } from "@ygopro/room/application/YGOProGameCreatorHandler";
import { YGOProJoinHandler } from "@ygopro/room/application/YGOProJoinHandler";
import { YGOProMessageRepository } from "@ygopro/room/infrastructure/YGOProMessageRepository";

export class WSYGOProServer {
	private readonly wss: WebSocketServer;
	private readonly logger: Logger;
	private readonly roomFinder: RoomFinder;
	private readonly userAuth: UserAuth;
	private readonly checkIfUserCanJoin: CheckIfUseCanJoin;

	constructor(logger: Logger) {
		this.logger = logger;
		this.roomFinder = new RoomFinder();
		const server = createServer();
		this.wss = new WebSocketServer({ server });
		this.userAuth = new UserAuth(new UserProfilePostgresRepository());
		this.checkIfUserCanJoin = new CheckIfUseCanJoin(this.userAuth);
	}

	initialize(): void {
		const port = config.servers.mercury.wsPort;

		this.wss.options.server?.listen(port, () => {
			this.logger.info(`Mercury WebSocket Server listen in port ${port}`);
		});

		this.wss.on("connection", (socket: WebSocket) => {
			const ygoClientSocket = new WebSocketClientSocket(socket);
			const eventEmitter = new EventEmitter();
			const messageRepository = new YGOProMessageRepository();
			const address = ygoClientSocket.remoteAddress;

			ygoClientSocket.id = uuidv4();

			const connectionLogger = this.logger.child({
				file: "MercuryWSServer",
				socketId: ygoClientSocket.id,
				remoteAddress: address,
			});

			connectionLogger.info("Client connected via WebSocket");

			const createGameListener = () => {
				new YGOProGameCreatorHandler(eventEmitter, connectionLogger, messageRepository);
			};
			const joinGameListener = () => {
				new YGOProJoinHandler(
					eventEmitter,
					connectionLogger,
					ygoClientSocket,
					this.checkIfUserCanJoin,
					messageRepository,
				);
			};

			const messageEmitter = new MessageEmitter(
				connectionLogger,
				eventEmitter,
				createGameListener,
				joinGameListener,
			);

			ygoClientSocket.onMessage((data: Buffer) => {
				connectionLogger.debug(
					`Incoming message handle by Mercury WS Server: ${data.toString("hex")}`,
				);
				messageEmitter.handleMessage(data);
			});

			ygoClientSocket.onClose(() => {
				connectionLogger.info("Client left via WebSocket close event");
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(address);
			});
		});
	}
}
