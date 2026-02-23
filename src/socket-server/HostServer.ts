
import { randomUUID as uuidv4 } from "crypto";
import net, { Socket } from "net";
import { config } from "src/config";
import { MatchResumeCreator } from "src/shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "src/shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { MatchResumePostgresRepository } from "src/shared/stats/match-resume/infrastructure/postgres/MatchResumePostgresRepository";
import { PlayerStatsPostgresRepository } from "src/shared/stats/player-stats/infrastructure/PlayerStatsPostgresRepository";
import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";
import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfilePostgresRepository } from "src/shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";
import { EventEmitter } from "stream";

import { Commands } from "../edopro/messages/domain/Commands";
import { MessageEmitter } from "../edopro/MessageEmitter";
import { ExpressReconnectHandler } from "../edopro/room/application/ExpressReconnectHandler";
import { GameCreatorHandler } from "../edopro/room/application/GameCreatorHandler";
import { JoinHandler } from "../edopro/room/application/JoinHandler";
import { container } from "../shared/dependency-injection";
import { EventBus } from "../shared/event-bus/EventBus";
import { Logger } from "../shared/logger/domain/Logger";
import { DisconnectHandler } from "../shared/room/application/DisconnectHandler";
import { RoomFinder } from "../shared/room/application/RoomFinder";
import { TCPClientSocket } from "../shared/socket/domain/TCPClientSocket";
import { BasicStatsCalculator } from "../shared/stats/basic/application/BasicStatsCalculator";

import { UnrankedMatchSaver } from "src/shared/stats/unranked-match/application/UnrankedMatchSaver";
import { UnrankedMatchPostgresRepository } from "src/shared/stats/unranked-match/infrastructure/postgres/UnrankedMatchPostgresRepository";

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
		this.server.listen(config.servers.host.port, () => {
			this.logger.info(`Server listen in port ${config.servers.host.port}`);
		});
		this.server.on("connection", (socket: Socket) => {
			this.address = socket.remoteAddress;
			const tcpClientSocket = new TCPClientSocket(socket);
			const eventEmitter = new EventEmitter();
			tcpClientSocket.id = uuidv4();

			const connectionLogger = this.logger.child({
				file: "HostServer",
				socketId: tcpClientSocket.id,
				remoteAddress: this.address,
			});

			connectionLogger.info("Client connected");

			const createGameListener = (roomId: number) => {
				new GameCreatorHandler(
					eventEmitter,
					connectionLogger,
					tcpClientSocket,
					this.userAuth,
					roomId
				);
			};

			const joinGameListener = () => {
				new JoinHandler(eventEmitter, connectionLogger, tcpClientSocket, this.checkIfUserCanJoin);
			};

			new ExpressReconnectHandler(eventEmitter, connectionLogger, tcpClientSocket);

			const messageEmitter = new MessageEmitter(
				connectionLogger,
				eventEmitter,
				createGameListener,
				joinGameListener
			);

			socket.on("data", (data: Buffer) => {
				connectionLogger.debug(`roomId: ${tcpClientSocket.roomId} - Incoming message: ${data.toString("hex")}`);
				
				if (data.length >= 3) {
					const command = data.readUInt8(2);
					if (command === Commands.PING) {
						const pongResponse = Buffer.alloc(data.length);
						data.copy(pongResponse);
						pongResponse.writeUInt8(0xfe, 2);
						socket.write(pongResponse);
						return;
					}
				}
				
				messageEmitter.handleMessage(data);
			});

			socket.on("end", () => {
				connectionLogger.info(`roomId: ${tcpClientSocket.roomId} - left in end event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("close", () => {

				connectionLogger.info(`roomId: ${tcpClientSocket.roomId} - left in close event`);
				const disconnectHandler = new DisconnectHandler(tcpClientSocket, this.roomFinder);
				disconnectHandler.run(this.address);
			});

			socket.on("error", (_error) => {

				connectionLogger.error(`roomId: ${tcpClientSocket.roomId} - left in error event`, { err: _error });
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

		eventBus.subscribe(
			UnrankedMatchSaver.ListenTo,
			new UnrankedMatchSaver(
				this.logger,
				new UnrankedMatchPostgresRepository()
			)
		);
	}
}
