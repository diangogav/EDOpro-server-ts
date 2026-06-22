import { randomUUID as uuidv4 } from "crypto";
import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "src/config";
import { EventEmitter } from "stream";

import { MessageEmitter } from "../edopro/MessageEmitter";
import { Logger } from "../shared/logger/domain/Logger";
import { Commands } from "../shared/messages/Commands";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { ExpressReconnectHandler } from "../shared/room/application/reconnect/ExpressReconnectHandler";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";
import { YGOProGameCreatorHandler } from "@ygopro/room/application/YGOProGameCreatorHandler";
import { YGOProJoinHandler } from "@ygopro/room/application/YGOProJoinHandler";
import { YGOProMessageRepository } from "@ygopro/room/infrastructure/YGOProMessageRepository";
import YGOProRoomList from "@ygopro/room/infrastructure/YGOProRoomList";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";

// Application-level PONG command echoed back to the client for a PING (0xff).
const PONG_COMMAND = 0xfe;

// The raw ws socket, tagged with the liveness flag used by the heartbeat sweep.
type HeartbeatSocket = WebSocket & { isAlive?: boolean };

export class WSYGOProServer {
	private readonly wss: WebSocketServer;
	private readonly logger: Logger;
	private readonly roomFinder: RoomFinder;
	private readonly handshakeAuth: HandshakeTicketAuthenticator;

	constructor(logger: Logger, handshakeAuth: HandshakeTicketAuthenticator) {
		this.logger = logger;
		this.handshakeAuth = handshakeAuth;
		this.roomFinder = new RoomFinder();
		const server = createServer();
		this.wss = new WebSocketServer({ server });
	}

	initialize(): void {
		const port = config.servers.mercury.wsPort;

		this.wss.options.server?.listen(port);

		// Heartbeat: drop half-open connections (e.g. a mobile client whose runtime
		// is frozen in background). The browser/native WS layer auto-replies to ping
		// frames, so a missing pong across one interval means the peer is gone. The
		// terminate() fires the existing onClose -> DisconnectHandler -> room cleanup.
		const heartbeatInterval = setInterval(() => {
			this.wss.clients.forEach((client) => {
				const heartbeatSocket = client as HeartbeatSocket;
				if (heartbeatSocket.isAlive === false) {
					heartbeatSocket.terminate();
					return;
				}
				heartbeatSocket.isAlive = false;
				heartbeatSocket.ping();
			});
		}, config.servers.mercury.wsHeartbeatIntervalMs);
		heartbeatInterval.unref();

		this.wss.on("close", () => {
			clearInterval(heartbeatInterval);
		});

		this.wss.on("connection", async (socket: WebSocket, request: IncomingMessage) => {
			const heartbeatSocket = socket as HeartbeatSocket;
			heartbeatSocket.isAlive = true;
			socket.on("pong", () => {
				heartbeatSocket.isAlive = true;
			});

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
				new YGOProJoinHandler(eventEmitter, connectionLogger, ygoClientSocket, messageRepository);
			};

			const messageEmitter = new MessageEmitter(
				connectionLogger,
				eventEmitter,
				createGameListener,
				joinGameListener,
			);

			// Bridge a token reconnect (0xfd) arriving on this fresh WS connection to
			// its owning room as an EXPRESS_RECONNECT event. WS-only by construction:
			// resolves against YGOProRoomList and only accepts YGOProClient tokens.
			new ExpressReconnectHandler(
				eventEmitter,
				connectionLogger,
				ygoClientSocket,
				(roomId) => YGOProRoomList.findById(roomId) ?? undefined,
				(client) => client instanceof YGOProClient,
			);

			// Gate: register the pump BEFORE awaiting the ticket check so that
			// the first PlayerInfo / JoinGame binary frame is never dropped if it
			// arrives while Redis is still being queried.
			let resolveReady!: () => void;
			const ready = new Promise<void>((resolve) => {
				resolveReady = resolve;
			});

			ygoClientSocket.onMessage(async (data: Buffer) => {
				// Any inbound frame proves the peer is alive — keeps active duels
				// from being reaped by the heartbeat even if a pong is delayed.
				heartbeatSocket.isAlive = true;
				connectionLogger.debug(
					`Incoming message handle by Mercury WS Server: ${data.toString("hex")}`,
				);
				await ready;

				// Application-level ping (0xff): echo it straight back as a pong (0xfe)
				// preserving the payload, so the client can measure RTT in-duel. Mirrors
				// the TCP server (SocketConnectionHandler); MessageEmitter ignores 0xff.
				if (data.length >= 3 && data.readUInt8(2) === Commands.PING) {
					const pongResponse = Buffer.alloc(data.length);
					data.copy(pongResponse);
					pongResponse.writeUInt8(PONG_COMMAND, 2);
					ygoClientSocket.send(pongResponse);
					return;
				}

				messageEmitter.handleMessage(data);
			});

			ygoClientSocket.onClose(() => {
				connectionLogger.info("Client left via WebSocket close event");
				const disconnectHandler = new DisconnectHandler(ygoClientSocket, this.roomFinder);
				disconnectHandler.run(address);
			});

			const auth = await this.handshakeAuth.authenticate(request);
			if (auth.status === "authenticated") {
				ygoClientSocket.resolvedUserId = auth.userId;
			}
			if (auth.status === "rejected") {
				ygoClientSocket.close();
			}
			// Ungate the pump — but never for a rejected connection, so a frame
			// buffered during the ticket check is not dispatched to a closed socket.
			if (auth.status !== "rejected") {
				resolveReady();
			}
		});
	}
}
