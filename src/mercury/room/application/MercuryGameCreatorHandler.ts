import { EventEmitter } from "stream";

import { Commands } from "../../../modules/messages/domain/Commands";
import { ClientMessage } from "../../../modules/messages/MessageProcessor";
import { Logger } from "../../../modules/shared/logger/domain/Logger";
import { GameCreatorMessageHandler } from "../../../modules/shared/room/domain/GameCreatorMessageHandler";

export class MercuryGameCreatorHandler implements GameCreatorMessageHandler {
	private readonly logger: Logger;
	private readonly eventEmitter: EventEmitter;

	constructor(eventEmitter: EventEmitter, logger: Logger) {
		this.eventEmitter = eventEmitter;
		this.logger = logger;
		this.eventEmitter.on(Commands.CREATE_GAME as unknown as string, (message: ClientMessage) => {
			void this.handle(message);
		});
	}

	// eslint-disable-next-line @typescript-eslint/require-await
	async handle(message: ClientMessage): Promise<void> {
		this.logger.info(`Game Creator Message: ${message.data.toString("hex")}`);
	}
}
