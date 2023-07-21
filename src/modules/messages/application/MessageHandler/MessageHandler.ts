/* eslint-disable @typescript-eslint/no-misused-promises */
import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { Logger } from "../../../shared/logger/domain/Logger";
import { UserFinder } from "../../../user/application/UserFinder";
import { UserRedisRepository } from "../../../user/infrastructure/UserRedisRepository";
import { Commands } from "../../domain/Commands";
import { MessageHandlerContext } from "./MessageHandlerContext";
import { ClientMessage } from "./MessageProcessor";
import { ChatCommandStrategy } from "./Strategies/ChatCommandStrategy";
import { CreateGameCommandStrategy } from "./Strategies/CreateGameCommandStrategy";
import { JoinGameCommandStrategy } from "./Strategies/JoinGameCommandStrategy";
import { ResponseCommandStrategy } from "./Strategies/ResponseCommandStrategy";
import { SurrenderCommandStrategy } from "./Strategies/SurrenderCommandStrategy";

export class MessageHandler {
	private readonly context: MessageHandlerContext;
	private readonly logger: Logger;
	private readonly message: ClientMessage;

	constructor(data: ClientMessage, socket: YGOClientSocket, logger: Logger) {
		this.context = new MessageHandlerContext(data, socket);
		this.logger = logger;
		this.message = data;
	}

	async read(): Promise<void> {
		if (this.message.command === Commands.PLAYER_INFO) {
			this.logger.debug("PLAYER_INFO");
			// this.context.setStrategy(new PlayerInfoCommandStrategy(this.context));
		}

		if (this.message.command === Commands.CREATE_GAME) {
			this.logger.debug("CREATE_GAME");
			this.context.setStrategy(
				new CreateGameCommandStrategy(this.context, new UserFinder(new UserRedisRepository()))
			);
		}

		if (this.message.command === Commands.JOIN_GAME) {
			this.logger.debug("JOIN_GAME");
			this.context.setStrategy(
				new JoinGameCommandStrategy(this.context, new UserFinder(new UserRedisRepository()))
			);
		}

		if (this.message.command === Commands.RESPONSE) {
			this.logger.debug("RESPONSE");
			this.context.setStrategy(new ResponseCommandStrategy(this.context));
		}

		if (this.message.command === Commands.CHAT) {
			this.logger.debug("CHAT");
			this.context.setStrategy(new ChatCommandStrategy(this.context));
		}

		if (this.message.command === Commands.SURRENDER) {
			this.logger.debug("SURRENDER");
			this.context.setStrategy(new SurrenderCommandStrategy(this.context));
		}

		if (this.message.command === Commands.TIME_CONFIRM) {
			this.logger.debug("TIME_CONFIRM");
		}

		await this.context.execute();
	}
}
