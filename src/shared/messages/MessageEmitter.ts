import { EventEmitter } from "stream";

import { Logger } from "@shared/logger/domain/Logger";
import { Commands } from "./Commands";
import { MessageProcessor } from "./MessageProcessor";

const MATCHMAKING_COMMANDS: readonly Commands[] = [
	Commands.MATCHMAKING_AUTH,
	Commands.MATCHMAKING_ENTER,
	Commands.MATCHMAKING_CANCEL,
	Commands.MATCHMAKING_ACCEPT,
	Commands.MATCHMAKING_DECLINE,
];

export class MessageEmitter {
	private readonly messageProcessor: MessageProcessor;
	constructor(
		private readonly logger: Logger,
		private readonly eventEmitter: EventEmitter,
		private readonly createGameListener: () => void,
		private readonly joinGameListener: () => void,
	) {
		this.messageProcessor = new MessageProcessor();
		this.logger = logger.child({ file: "MessageEmitter" });
	}

	handleMessage(data: Buffer): void {
		this.messageProcessor.read(data);
		this.processMessage();
	}

	processMessage(): void {
		while (this.messageProcessor.isMessageReady()) {
			this.processNextFrame();
		}
	}

	private processNextFrame(): void {
		this.messageProcessor.process();

		const payload = this.messageProcessor.payload;

		this.logger.debug(`Incoming command: ${payload.command}`, { size: payload.size });

		if (this.messageProcessor.command === Commands.PLAYER_INFO) {
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload,
			);
		}

		if (this.messageProcessor.command === Commands.CREATE_GAME) {
			this.createGameListener();
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload,
			);
		}

		if (this.messageProcessor.command === Commands.JOIN_GAME) {
			this.joinGameListener();
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload,
			);
		}

		if (this.messageProcessor.command === Commands.RECONNECT) {
			this.logger.info(`Emitting RECONNECT event for command ${Commands.RECONNECT}`);
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload,
			);
		}

		if (MATCHMAKING_COMMANDS.includes(this.messageProcessor.command)) {
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload,
			);
		}
	}
}
