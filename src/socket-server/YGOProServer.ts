import net, { Socket } from "net";
import { config } from "src/config";

import { Logger } from "../shared/logger/domain/Logger";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";
import { MatchmakingConnectionFactory } from "@ygopro/matchmaking/application/MatchmakingConnectionFactory";
import { YGOProConnectionHandler } from "./YGOProConnectionHandler";

export class YGOProServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly connectionHandler: YGOProConnectionHandler;

	constructor(logger: Logger, matchmakingConnectionFactory?: MatchmakingConnectionFactory) {
		this.logger = logger;
		this.connectionHandler = new YGOProConnectionHandler(
			logger,
			new RoomFinder(),
			matchmakingConnectionFactory,
		);
		this.server = net.createServer({ keepAlive: true });
	}

	initialize(): void {
		this.server.listen(config.servers.mercury.port);

		this.server.on("connection", (socket: Socket) => {
			const ygoClientSocket = new TCPClientSocket(socket);

			this.connectionHandler.handle(ygoClientSocket);

			// Cleanup runs only on `close` (via onClose, wired inside the
			// connection handler), like the other servers. `end`/`error` fire
			// before the socket is closed and `close` always follows, so wiring
			// all three ran cleanup 2-3x with stale state; `end`/`error` below
			// are logging only — do not add cleanup there.
			socket.on("end", () => {
				this.logger.info(`${socket.remoteAddress} left in end event`);
			});

			socket.on("error", (_error) => {
				this.logger.info(`${socket.remoteAddress} left in error event`);
			});
		});
	}
}
