import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
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
		this.server.listen(7711, () => {
			this.logger.info("Mercury server listen in port 7711");
		});

		this.server.on("connection", (socket: Socket) => {
			this.logger.info("Client connected to Mercury server!!!");
			this.address = socket.remoteAddress;
			const ygoClientSocket = new TCPClientSocket(socket);
			const eventEmitter = new EventEmitter();
			const gameCreatorHandler = new MercuryGameCreatorHandler(eventEmitter, this.logger);
			const joinHandler = new MercuryJoinHandler(
				eventEmitter,
				this.logger,
				ygoClientSocket,
				this.checkIfUserCanJoin
			);
			const messageEmitter = new MessageEmitter(
				this.logger,
				eventEmitter,
				gameCreatorHandler,
				joinHandler
			);
			ygoClientSocket.id = uuidv4();
			socket.on("data", (data: Buffer) => {
				this.logger.debug(`Incoming message handle by Mercury Server: ${data.toString("hex")}`);
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
}
