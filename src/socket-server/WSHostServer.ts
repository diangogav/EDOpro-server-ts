import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "src/config";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { Logger } from "../shared/logger/domain/Logger";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { WebSocketClientSocket } from "../shared/socket/domain/WebSocketClientSocket";
import { SocketConnectionHandler } from "./SocketConnectionHandler";

export class WSHostServer {
	private readonly wss: WebSocketServer;
	private readonly logger: Logger;
	private readonly connectionHandler: SocketConnectionHandler;

	constructor(logger: Logger) {
		this.logger = logger;
		const server = createServer();
		this.wss = new WebSocketServer({ server });
		
		const roomFinder = new RoomFinder();
		const userAuth = new UserAuth(new UserProfilePostgresRepository());
		const checkIfUserCanJoin = new CheckIfUseCanJoin(userAuth);
		
		this.connectionHandler = new SocketConnectionHandler(
			this.logger,
			roomFinder,
			userAuth,
			checkIfUserCanJoin
		);
	}

	initialize(): void {
		const port = config.servers.websocket.duelPort;
		
		this.wss.options.server?.listen(port, () => {
			this.logger.info(`WebSocket Host Server listen in port ${port}`);
		});

		this.wss.on("connection", (socket: WebSocket) => {
			const wsClientSocket = new WebSocketClientSocket(socket);
			this.connectionHandler.handle(wsClientSocket);
		});
	}
}
