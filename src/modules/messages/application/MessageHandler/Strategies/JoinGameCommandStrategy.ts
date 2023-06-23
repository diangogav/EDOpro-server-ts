import { JoinToGame } from "../../../../room/application/JoinToGame";
import { JoinToGameAsExpectator } from "../../../../room/application/JoinToGameAsExpectator";
import { JoinGameMessage } from "../../../client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class JoinGameCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(private readonly context: MessageHandlerContext) {}

	execute(): void {
		const body = this.context.readBody(this.context.messageLength());
		const joinGameMessage = new JoinGameMessage(body);
		const joinToGame = new JoinToGame(this.context.socket);
		const jointToGameAsSpectator = new JoinToGameAsExpectator(this.context.socket);
		const playerInfoMessage = this.context.getPreviousMessages() as PlayerInfoMessage;
		joinToGame.run(joinGameMessage, playerInfoMessage.name);
		jointToGameAsSpectator.run(joinGameMessage, playerInfoMessage.name);
	}
}
