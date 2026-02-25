import { EventEmitter } from "stream";
import { randomUUID as uuidv4 } from "crypto";
import { config } from "src/config";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";
import { Commands } from "../edopro/messages/domain/Commands";
import { MessageEmitter } from "../edopro/MessageEmitter";
import { ExpressReconnectHandler } from "../edopro/room/application/ExpressReconnectHandler";
import { GameCreatorHandler } from "../edopro/room/application/GameCreatorHandler";
import { JoinHandler } from "../edopro/room/application/JoinHandler";
import { Logger } from "../shared/logger/domain/Logger";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { ISocket } from "../shared/socket/domain/ISocket";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";

export class SocketConnectionHandler {
	constructor(
		private readonly logger: Logger,
		private readonly roomFinder: RoomFinder,
		private readonly userAuth: UserAuth,
		private readonly checkIfUserCanJoin: CheckIfUseCanJoin
	) {}

	handle(socket: ISocket): void {
		const eventEmitter = new EventEmitter();
		socket.id = uuidv4();

		const connectionLogger = this.logger.child({
			file: "SocketConnectionHandler",
			socketId: socket.id,
			remoteAddress: socket.remoteAddress,
		});

		connectionLogger.info("Client connected");

		const createGameListener = (roomId: number) => {
			new GameCreatorHandler(
				eventEmitter,
				connectionLogger,
				socket,
				this.userAuth,
				roomId
			);
		};

		const joinGameListener = () => {
			new JoinHandler(eventEmitter, connectionLogger, socket, this.checkIfUserCanJoin);
		};

		new ExpressReconnectHandler(eventEmitter, connectionLogger, socket);

		const messageEmitter = new MessageEmitter(
			connectionLogger,
			eventEmitter,
			createGameListener,
			joinGameListener
		);

		socket.onMessage((data: Buffer) => {
			connectionLogger.debug(`roomId: ${socket.roomId} - Incoming message: ${data.toString("hex")}`);
			
			if (data.length >= 3) {
				const command = data.readUInt8(2);
				if (command === Commands.PING) {
					const pongResponse = Buffer.alloc(data.length);
					data.copy(pongResponse);
					pongResponse.writeUInt8(0xfe, 2);
					socket.send(pongResponse);
					return;
				}
			}
			
			messageEmitter.handleMessage(data);
		});

		socket.onClose(() => {
			connectionLogger.info(`roomId: ${socket.roomId} - client disconnected`);
			const disconnectHandler = new DisconnectHandler(socket, this.roomFinder);
			disconnectHandler.run(socket.remoteAddress);
		});
	}
}
