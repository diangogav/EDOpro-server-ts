/* eslint-disable @typescript-eslint/no-floating-promises */
import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
import { MatchResumeCreator } from "src/shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "src/shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { MatchResumePostgresRepository } from "src/shared/stats/match-resume/infrastructure/postgres/MatchResumePostgresRepository";
import { PlayerStatsPostgresRepository } from "src/shared/stats/player-stats/infrastructure/PlayerStatsPostgresRepository";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { EventEmitter } from "stream";

import { MessageEmitter } from "../edopro/MessageEmitter";
import { GameCreatorHandler } from "../edopro/room/application/GameCreatorHandler";
import { JoinHandler } from "../edopro/room/application/JoinHandler";
import { container } from "../shared/dependency-injection";
import { EventBus } from "../shared/event-bus/EventBus";
import { Logger } from "../shared/logger/domain/Logger";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";
import { BasicStatsCalculator } from "../shared/stats/basic/application/BasicStatsCalculator";

export class HostServer {
	private readonly server: net.Server;
	private readonly logger: Logger;
	private readonly roomFinder: RoomFinder;
	private address?: string;
	private readonly userAuth: UserAuth;
	private readonly checkIfUserCanJoin: CheckIfUseCanJoin;

	constructor(logger: Logger) {
		this.logger = logger;
		this.server = net.createServer({ keepAlive: true });
		this.roomFinder = new RoomFinder();
		this.registerSubscribers();
		this.userAuth = new UserAuth(new UserProfilePostgresRepository());
		this.checkIfUserCanJoin = new CheckIfUseCanJoin(this.userAuth);
	}

	initialize(): void {
		this.server.listen(7911, () => {
			this.logger.info("Server listen in port 7911");
		});
		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
			const tcpClientSocket = new TCPClientSocket(socket);
			const eventEmitter = new EventEmitter();
			const gameCreatorHandler = new GameCreatorHandler(
				eventEmitter,
				this.logger,
				tcpClientSocket,
				this.userAuth
			);
			const joinHandler = new JoinHandler(
				eventEmitter,
				this.logger,
				tcpClientSocket,
				this.checkIfUserCanJoin
			);
			const messageEmitter = new MessageEmitter(
				this.logger,
				eventEmitter,
				gameCreatorHandler,
				joinHandler
			);
			tcpClientSocket.id = uuidv4();

			socket.on("data", (data: Buffer) => {
				this.logger.debug(`Incoming message: ${data.toString("hex")}`);
				messageEmitter.handleMessage(data);
			});

			socket.on("end", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in end event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("close", () => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in close event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("error", (_error) => {
				// eslint-disable-next-line @typescript-eslint/restrict-template-expressions
				this.logger.info(`${socket.remoteAddress} left in error event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});
		});
	}

	private registerSubscribers(): void {
		const eventBus = container.get(EventBus);

		eventBus.subscribe(
			BasicStatsCalculator.ListenTo,
			// new BasicStatsCalculator(new RedisRoomRepository())
			new BasicStatsCalculator(
				this.logger,
				new UserProfilePostgresRepository(),
				new PlayerStatsPostgresRepository(),
				new MatchResumeCreator(new MatchResumePostgresRepository()),
				new DuelResumeCreator(new MatchResumePostgresRepository())
			)
		);
	}
}
