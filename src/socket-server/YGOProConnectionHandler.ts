import { randomUUID as uuidv4 } from "crypto";
import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "@shared/messages/Commands";
import { DisconnectHandler } from "@shared/room/application/DisconnectHandler";
import { RoomFinder } from "@shared/room/application/RoomFinder";
import { ExpressReconnectHandler } from "@shared/room/application/reconnect/ExpressReconnectHandler";
import { ISocket } from "@shared/socket/domain/ISocket";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProGameCreatorHandler } from "@ygopro/room/application/YGOProGameCreatorHandler";
import { YGOProJoinHandler } from "@ygopro/room/application/YGOProJoinHandler";
import { YGOProMessageRepository } from "@ygopro/room/infrastructure/YGOProMessageRepository";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { MatchmakingConnectionFactory } from "@ygopro/matchmaking/application/MatchmakingConnectionFactory";

import { MessageEmitter } from "../edopro/MessageEmitter";

/** No-op default: a socket server that never received a real factory (e.g. a
 * unit test constructing this handler directly) simply never wires matchmaking. */
const noopMatchmakingConnectionFactory: MatchmakingConnectionFactory = () => {
	/* intentionally empty */
};

export interface YGOProConnectionOptions {
	/** Resolves once identity/authorization for this connection is settled;
	 * resolving `false` leaves the connection gated forever (the caller is
	 * expected to close the socket in that case). Absent on a connection with
	 * no such gate, in which case the pump starts immediately. */
	authenticate?: () => Promise<boolean>;
	/** Runs on every inbound frame, before the pump waits on `authenticate`. */
	onInboundFrame?: () => void;
}

export class YGOProConnectionHandler {
	constructor(
		private readonly logger: Logger,
		private readonly roomFinder: RoomFinder,
		private readonly matchmakingConnectionFactory: MatchmakingConnectionFactory = noopMatchmakingConnectionFactory,
	) {}

	public handle(socket: ISocket, options: YGOProConnectionOptions = {}): void {
		const eventEmitter = new EventEmitter();
		const messageRepository = new YGOProMessageRepository();

		socket.id = uuidv4();

		const connectionLogger = this.logger.child({
			file: "YGOProConnectionHandler",
			socketId: socket.id,
			remoteAddress: socket.remoteAddress,
		});

		connectionLogger.info("Client connected");

		const createGameListener = (): void => {
			new YGOProGameCreatorHandler(eventEmitter, connectionLogger, messageRepository);
		};
		const joinGameListener = (): void => {
			new YGOProJoinHandler(eventEmitter, connectionLogger, socket, messageRepository);
		};

		new ExpressReconnectHandler(
			eventEmitter,
			connectionLogger,
			socket,
			(roomId) => YGOProRoomList.findById(roomId) ?? undefined,
			(client) => client instanceof YGOProClient,
		);

		const messageEmitter = new MessageEmitter(
			connectionLogger,
			eventEmitter,
			createGameListener,
			joinGameListener,
		);

		// Subscribes the matchmaking opcodes on this connection's emitter (D25).
		// Safe before the ready gate: dispatch to `messageEmitter.handleMessage`
		// is itself gated below, so nothing reaches these listeners early.
		this.matchmakingConnectionFactory(socket, eventEmitter);

		let resolveReady!: () => void;
		const ready = new Promise<void>((resolve) => {
			resolveReady = resolve;
		});

		socket.onMessage(async (data: Buffer) => {
			options.onInboundFrame?.();
			connectionLogger.debug(`Incoming message: ${data.toString("hex")}`);
			await ready;

			if (data.length >= 3 && data.readUInt8(2) === Commands.PING) {
				const pongResponse = Buffer.alloc(data.length);
				data.copy(pongResponse);
				pongResponse.writeUInt8(Commands.PONG, 2);
				socket.send(pongResponse);
				return;
			}

			messageEmitter.handleMessage(data);
		});

		socket.onClose(() => {
			connectionLogger.info(`roomId: ${socket.roomId} - client disconnected`);
			const disconnectHandler = new DisconnectHandler(socket, this.roomFinder);
			disconnectHandler.run(socket.remoteAddress);
		});

		if (options.authenticate) {
			void options.authenticate().then((proceed) => {
				if (proceed) {
					resolveReady();
				}
			});
			return;
		}

		resolveReady();
	}
}
