import net, { Socket } from "net";
import { config } from "src/config";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { Logger } from "../shared/logger/domain/Logger";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";

import { SocketConnectionHandler } from "./SocketConnectionHandler";

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly connectionHandler: SocketConnectionHandler;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer({ keepAlive: true });
		const roomFinder = new RoomFinder();
		const userAuth = new UserAuth(new UserProfilePostgresRepository());
		const checkIfUserCanJoin = new CheckIfUseCanJoin(userAuth);

		this.connectionHandler = new SocketConnectionHandler(
			this.logger,
			roomFinder,
			userAuth,
			checkIfUserCanJoin,
		);
	}

	initialize(): void {
		this.server.listen(config.servers.host.port);
		this.server.on("connection", (socket: Socket) => {
			const tcpClientSocket = new TCPClientSocket(socket);
			this.connectionHandler.handle(tcpClientSocket);
		});
	}
}
