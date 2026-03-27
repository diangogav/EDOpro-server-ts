import { EventEmitter } from "stream";

import { ClientMessage } from "@shared/messages/MessageProcessor";
import { Logger } from "@shared/logger/domain/Logger";
import { GameCreatorMessageHandler } from "@shared/room/domain/GameCreatorMessageHandler";
import { Commands } from "@shared/messages/Commands";

export class YGOProGameCreatorHandler implements GameCreatorMessageHandler {
	private readonly logger: Logger;
	private readonly eventEmitter: EventEmitter;

	constructor(eventEmitter: EventEmitter, logger: Logger) {
		this.eventEmitter = eventEmitter;
		this.logger = logger.child({ file: "MercuryGameCreatorHandler" });
		this.eventEmitter.on(Commands.CREATE_GAME as unknown as string, (message: ClientMessage) => {
			void this.handleCreateGame(message);
		});
	}


	async handleCreateGame(message: ClientMessage): Promise<void> {
		this.logger.info("CREATE_GAME");
		this.logger.debug(`Game Creator Message: ${message.data.toString("hex")}`);
	}
}
