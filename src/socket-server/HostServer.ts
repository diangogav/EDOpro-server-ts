import net, { Socket } from "net";
import { config } from "src/config";
import { MatchResumeCreator } from "src/shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "src/shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { MatchResumePostgresRepository } from "src/shared/stats/match-resume/infrastructure/postgres/MatchResumePostgresRepository";
import { PlayerStatsPostgresRepository } from "src/shared/stats/player-stats/infrastructure/PlayerStatsPostgresRepository";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { container } from "../shared/dependency-injection";
import { EventBus } from "../shared/event-bus/EventBus";
import { Logger } from "../shared/logger/domain/Logger";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";
import { BasicStatsCalculator } from "../shared/stats/basic/application/BasicStatsCalculator";

import { UnrankedMatchSaver } from "src/shared/stats/unranked-match/application/UnrankedMatchSaver";
import { UnrankedMatchPostgresRepository } from "src/shared/stats/unranked-match/infrastructure/postgres/UnrankedMatchPostgresRepository";
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
			checkIfUserCanJoin
		);

		this.registerSubscribers();
	}

	initialize(): void {
		this.server.listen(config.servers.host.port, () => {
			this.logger.info(`Server listen in port ${config.servers.host.port}`);
		});
		this.server.on("connection", (socket: Socket) => {
			const tcpClientSocket = new TCPClientSocket(socket);
			this.connectionHandler.handle(tcpClientSocket);
		});
	}

	private registerSubscribers(): void {
		const eventBus = container.get(EventBus);

		eventBus.subscribe(
			BasicStatsCalculator.ListenTo,
			new BasicStatsCalculator(
				this.logger,
				new UserProfilePostgresRepository(),
				new PlayerStatsPostgresRepository(),
				new MatchResumeCreator(new MatchResumePostgresRepository()),
				new DuelResumeCreator(new MatchResumePostgresRepository())
			)
		);

		eventBus.subscribe(
			UnrankedMatchSaver.ListenTo,
			new UnrankedMatchSaver(
				this.logger,
				new UnrankedMatchPostgresRepository()
			)
		);
	}
}
