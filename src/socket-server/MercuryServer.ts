import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
import { config } from "src/config";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { EventEmitter } from "stream";

import { MessageEmitter } from "../edopro/MessageEmitter";
import { MercuryGameCreatorHandler } from "../mercury/room/application/MercuryGameCreatorHandler";
import { MercuryJoinHandler } from "../mercury/room/application/MercuryJoinHandler";
import { Logger } from "../shared/logger/domain/Logger";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";

export class MercuryServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly roomFinder: RoomFinder;
	private address?: string;
	private readonly userAuth: UserAuth;
	private readonly checkIfUserCanJoin: CheckIfUseCanJoin;

	constructor(logger: Logger) {
		this.logger = logger;
		this.roomFinder = new RoomFinder();
		this.server = net.createServer({ keepAlive: true });
		this.userAuth = new UserAuth(new UserProfilePostgresRepository());
		this.checkIfUserCanJoin = new CheckIfUseCanJoin(this.userAuth);
	}

	initialize(): void {
		this.server.listen(config.servers.mercury.port, () => {
			this.logger.info(`Mercury server listen in port ${config.servers.mercury.port}`);
		});

		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
			const ygoClientSocket = new TCPClientSocket(socket);
			const eventEmitter = new EventEmitter();
			ygoClientSocket.id = uuidv4();

			const connectionLogger = this.logger.child({
				file: "	MercuryServer",
				socketId: ygoClientSocket.id,
				remoteAddress: this.address,
			});

			connectionLogger.info("Client connected");

			const createGameListener = () => {
				new MercuryGameCreatorHandler(eventEmitter, connectionLogger);
			};
			const joinGameListener = () => {
				new MercuryJoinHandler(
					eventEmitter,
					connectionLogger,
					ygoClientSocket,
					this.checkIfUserCanJoin
				);
			};

			const messageEmitter = new MessageEmitter(
				connectionLogger,
				eventEmitter,
				createGameListener,
				joinGameListener
			);

			socket.on("data", (data: Buffer) => {
				connectionLogger.debug(
					`Incoming message handle by Mercury Server: ${data.toString("hex")}`
				);
				messageEmitter.handleMessage(data);
			});

			socket.on("end", () => {
				 
				connectionLogger.info(`${socket.remoteAddress} left in end event`);
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("close", () => {
				 
				connectionLogger.info(`${socket.remoteAddress} left in close event`);
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("error", (_error) => {
				 
				connectionLogger.info(`${socket.remoteAddress} left in error event`);
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});
		});
	}
}
