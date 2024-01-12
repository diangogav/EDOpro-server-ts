import { EventEmitter } from "stream";

import { YGOClientSocket } from "../socket-server/HostServer";
import { Commands } from "./messages/domain/Commands";
import { MessageProcessor } from "./messages/MessageProcessor";
import { Logger } from "./shared/logger/domain/Logger";
import { GameCreatorMessageHandler } from "./shared/room/domain/GameCreatorMessageHandler";
import { JoinMessageHandler } from "./shared/room/domain/JoinMessageHandler";

export class MessageEmitter {
	private readonly messageProcessor: MessageProcessor;
	constructor(
		private readonly logger: Logger,
		private readonly socket: YGOClientSocket,
		private readonly eventEmitter: EventEmitter,
		private readonly gameCreaJoinJoinHandlertorHandler: GameCreatorMessageHandler,
		private readonly joinHandler: JoinMessageHandler
	) {
		this.messageProcessor = new MessageProcessor();
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

		const payload = this.messageProcessor.payload;
		this.logger.debug(`Incomming command: ${payload.command}`);
		this.logger.debug(`Size: ${payload.size}`);
		this.logger.debug(`Current Buffer: ${this.messageProcessor.currentBuffer.toString("hex")}`);
		this.logger.debug(`Current Data: ${payload.data.toString("hex")}`);

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
