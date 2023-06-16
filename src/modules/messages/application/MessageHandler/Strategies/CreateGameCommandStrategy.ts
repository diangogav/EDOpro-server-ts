import { GameCreator } from "../../../../room/application/GameCreator";
import { CreateGameMessage } from "../../../client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class CreateGameCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(
		private readonly context: MessageHandlerContext,
		private readonly afterExecuteCallback: () => void
	) {}

	execute(): void {
		const body = this.context.readBody(this.context.messageLength());
		const createGameMessage = new CreateGameMessage(body);
		const gameCreator = new GameCreator(this.context.socket);
		const playerInfoMessage = this.context.getPreviousMessages() as PlayerInfoMessage;
		gameCreator.run(createGameMessage, playerInfoMessage.name);
		this.afterExecuteCallback();
	}
}
