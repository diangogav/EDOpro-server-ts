import { createServer, IncomingMessage } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "src/config";

import { Logger } from "../shared/logger/domain/Logger";
import { createRoomFinder } from "src/bootstrap/roomFinder";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { MatchmakingConnectionFactory } from "@ygopro/matchmaking/application/MatchmakingConnectionFactory";
import { HandshakeTicketAuthenticator } from "./HandshakeTicketAuthenticator";
import { YGOProConnectionHandler } from "./YGOProConnectionHandler";

// The raw ws socket, tagged with the liveness flag used by the heartbeat sweep.
type HeartbeatSocket = WebSocket & { isAlive?: boolean };

export class WSYGOProServer {
	private readonly wss: WebSocketServer;
	private readonly connectionHandler: YGOProConnectionHandler;
	private readonly handshakeAuth: HandshakeTicketAuthenticator;
	private readonly logger: Logger;

	constructor(
		logger: Logger,
		handshakeAuth: HandshakeTicketAuthenticator,
		matchmakingConnectionFactory?: MatchmakingConnectionFactory,
	) {
		this.logger = logger;
		this.handshakeAuth = handshakeAuth;
		this.connectionHandler = new YGOProConnectionHandler(
			logger,
			createRoomFinder(),
			matchmakingConnectionFactory,
		);
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
			ygoClientSocket.supportsLobbyMetadata = request.headers["x-evolution-lobby"] === "1";
			ygoClientSocket.clientName = readClientName(request);

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
			if (auth.status === "unavailable") {
				// Ticket validity is unknown: carry on anonymous (no resolvedUserId), so
				// ranked/verified-only gates still refuse the seat but casual play and
				// token reconnects keep working.
				this.logger.warn("Handshake ticket store unavailable; treating socket as anonymous", {
					remoteAddress: ygoClientSocket.remoteAddress,
				});
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

const CLIENT_NAME_PATTERN = /^[a-z0-9-]{1,32}$/;

/**
 * Self-reported client name from the handshake `?client=` query param. It only
 * labels match rows for stats, so anything outside a short slug is dropped
 * rather than stored.
 */
function readClientName(request: IncomingMessage): string | undefined {
	if (request.url === undefined) return undefined;
	let raw: string | null;
	try {
		// request.url is relative (e.g. "/?client=evoduel"); the base is only for parsing.
		raw = new URL(request.url, "http://placeholder").searchParams.get("client");
	} catch {
		// A malformed request-target (e.g. "//") must not reject the connection handler.
		return undefined;
	}
	const name = raw?.toLowerCase();
	return name !== undefined && CLIENT_NAME_PATTERN.test(name) ? name : undefined;
}
