import { JoinToGame } from "../../../../room/application/JoinToGame";
import { JoinToGameAsExpectator } from "../../../../room/application/JoinToGameAsExpectator";
import { ReconnectToGame } from "../../../../room/application/ReconnectToGame";
import { RoomFinder } from "../../../../room/application/RoomFinder";
import ReconnectingPlayers from "../../../../shared/ReconnectingPlayers";
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

		const reconnectingClient = ReconnectingPlayers.get().find(
			(item) => this.context.socket.remoteAddress === item.address
		);

		if (reconnectingClient) {
			const reconnectToGame = new ReconnectToGame(this.context.socket, new RoomFinder());
			reconnectToGame.run(joinGameMessage, playerInfoMessage.name, reconnectingClient);

			return;
		}

		joinToGame.run(joinGameMessage, playerInfoMessage.name);
		jointToGameAsSpectator.run(joinGameMessage, playerInfoMessage.name);
	}
}
