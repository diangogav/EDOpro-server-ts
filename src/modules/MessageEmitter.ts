import { EventEmitter } from "stream";

import { YGOClientSocket } from "../socket-server/HostServer";
import { Commands } from "./messages/domain/Commands";
import { MessageProcessor } from "./messages/MessageProcessor";
import { GameCreatorHandler } from "./room/application/GameCreatorHandler";
import { JoinHandler } from "./room/application/JoinHandler";
import { Logger } from "./shared/logger/domain/Logger";
import { UserFinder } from "./user/application/UserFinder";
import { UserRedisRepository } from "./user/infrastructure/UserRedisRepository";

export class MessageEmitter {
	private readonly eventEmitter: EventEmitter;
	private readonly gameCreatorHandler: GameCreatorHandler;
	private readonly joinHandler: JoinHandler;
	private readonly messageProcessor: MessageProcessor;
	constructor(private readonly logger: Logger, private readonly socket: YGOClientSocket) {
		this.eventEmitter = new EventEmitter();
		this.messageProcessor = new MessageProcessor();
		this.gameCreatorHandler = new GameCreatorHandler(
			this.eventEmitter,
			this.logger,
			socket,
			new UserFinder(new UserRedisRepository())
		);
		this.joinHandler = new JoinHandler(this.eventEmitter, this.logger, socket);
	}

	handleMessage(data: Buffer): void {
		this.messageProcessor.read(data);
		this.processMessage();
	}

	processMessage(): void {
		if (!this.messageProcessor.isMessageReady()) {
			return;
		}

		this.messageProcessor.process();

		if (this.messageProcessor.command === Commands.PLAYER_INFO) {
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload
			);
		}

		if (this.messageProcessor.command === Commands.CREATE_GAME) {
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload
			);
		}

		if (this.messageProcessor.command === Commands.JOIN_GAME) {
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload
			);
		}

		this.processMessage();
	}
}
