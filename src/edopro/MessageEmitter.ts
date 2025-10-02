import { generateUniqueId } from "src/utils/generateUniqueId";
import { EventEmitter } from "stream";

import { Logger } from "../shared/logger/domain/Logger";
import { Commands } from "./messages/domain/Commands";
import { MessageProcessor } from "./messages/MessageProcessor";

export class MessageEmitter {
	private readonly messageProcessor: MessageProcessor;
	constructor(
		private readonly logger: Logger,
		private readonly eventEmitter: EventEmitter,
		private readonly createGameListener: (roomId: number) => void,
		private readonly joinGameListener: () => void
	) {
		this.messageProcessor = new MessageProcessor();
		this.logger = logger.child({ file: "MessageEmitter" });
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

		if (this.messageProcessor.command === Commands.PLAYER_INFO) {
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload
			);
		}

		if (this.messageProcessor.command === Commands.CREATE_GAME) {
			const roomId = generateUniqueId();
			const logger = this.logger.child({ roomId });
			logger.debug(`Incomming command: ${payload.command}`);
			logger.debug(`Size: ${payload.size}`);
			logger.debug(`Current Buffer: ${this.messageProcessor.currentBuffer.toString("hex")}`);
			logger.debug(`Current Data: ${payload.data.toString("hex")}`);
			this.createGameListener(roomId);
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload
			);
		}

		if (this.messageProcessor.command === Commands.JOIN_GAME) {
			this.joinGameListener();
			this.eventEmitter.emit(
				this.messageProcessor.command as unknown as string,
				this.messageProcessor.payload
			);
		}

		this.processMessage();
	}
}
