import { JoinToGame } from "../../../../room/application/JoinToGame";
import { JoinGameMessage } from "../../../client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class JoinGameCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(private readonly context: MessageHandlerContext) {}

	execute(): void {
		const body = this.context.readBody(JoinGameMessage.MAX_BYTES_LENGTH);
		const joinGameMessage = new JoinGameMessage(body);
		const joinToGame = new JoinToGame(this.context.socket);
		const playerInfoMessage = this.context.getPreviousMessages() as PlayerInfoMessage;
		joinToGame.run(joinGameMessage, playerInfoMessage.name);
	}
}
