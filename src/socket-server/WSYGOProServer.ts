import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "src/config";

import { Logger } from "../shared/logger/domain/Logger";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";
import { YGOProConnectionHandler } from "./YGOProConnectionHandler";

// The raw ws socket, tagged with the liveness flag used by the heartbeat sweep.
type HeartbeatSocket = WebSocket & { isAlive?: boolean };

export class WSYGOProServer {
	private readonly wss: WebSocketServer;
	private readonly connectionHandler: YGOProConnectionHandler;
	private readonly handshakeAuth: HandshakeTicketAuthenticator;

	constructor(logger: Logger, handshakeAuth: HandshakeTicketAuthenticator) {
		this.handshakeAuth = handshakeAuth;
		this.connectionHandler = new YGOProConnectionHandler(logger, new RoomFinder());
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

			// Gate: the connection handler registers the pump BEFORE this resolves,
			// so the first PlayerInfo / JoinGame binary frame is never dropped if
			// it arrives while Redis is still being queried.
			let resolveAuthenticated!: (proceed: boolean) => void;
			const authenticated = new Promise<boolean>((resolve) => {
				resolveAuthenticated = resolve;
			});

			this.connectionHandler.handle(ygoClientSocket, {
				authenticate: () => authenticated,
				// Any inbound frame proves the peer is alive — keeps active duels
				// from being reaped by the heartbeat even if a pong is delayed.
				onInboundFrame: () => {
					heartbeatSocket.isAlive = true;
				},
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
			resolveAuthenticated(auth.status !== "rejected");
		});
	}
}
