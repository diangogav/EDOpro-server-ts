import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { Logger } from "../../../shared/logger/domain/Logger";
import { Commands } from "../../domain/Commands";
import { MessageHandlerContext } from "./MessageHandlerContext";
import { CreateGameCommandStrategy } from "./Strategies/CreateGameCommandStrategy";
import { JoinGameCommandStrategy } from "./Strategies/JoinGameCommandStrategy";
import { PlayerInfoCommandStrategy } from "./Strategies/PlayerInfoCommandStrategy";
import { ResponseCommandStrategy } from "./Strategies/ResponseCommandStrategy";

export class MessageHandler {
	private readonly context: MessageHandlerContext;
	private readonly logger: Logger;

	constructor(data: Buffer, socket: YGOClientSocket, logger: Logger) {
		this.context = new MessageHandlerContext(data, socket);
		this.logger = logger;
	}

	read(): void {
		if (this.context.isDataEmpty()) {
			return;
		}
		const header = this.context.readHeader();
		const command = header.subarray(2, 3).readInt8();

		if (command === Commands.PLAYER_INFO) {
			this.logger.debug("PLAYER_INFO");
			this.context.setStrategy(new PlayerInfoCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.CREATE_GAME) {
			this.logger.debug("CREATE_GAME");
			this.context.setStrategy(new CreateGameCommandStrategy(this.context, () => this.read()));
		}

		if (command === Commands.JOIN_GAME) {
			this.logger.debug("JOIN_GAME");
			this.context.setStrategy(new JoinGameCommandStrategy(this.context));
		}

		if (command === Commands.RESPONSE) {
			this.logger.debug("RESPONSE");
			this.context.setStrategy(new ResponseCommandStrategy(this.context));
		}

		if (command === Commands.CHAT) {
			this.logger.debug("CHAT");
		}

		if (command === Commands.TIME_CONFIRM) {
			this.logger.debug("TIME_CONFIRM");
		}

		this.context.execute();
	}
}
