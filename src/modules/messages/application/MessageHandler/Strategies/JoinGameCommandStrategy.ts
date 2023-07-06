import { JoinToGame } from "../../../../room/application/JoinToGame";
import { ReconnectToGame } from "../../../../room/application/ReconnectToGame";
import { RoomFinder } from "../../../../room/application/RoomFinder";
import RoomList from "../../../../room/infrastructure/RoomList";
import { JoinGameMessage } from "../../../client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../client-to-server/PlayerInfoMessage";
import { ServerErrorClientMessage } from "../../../server-to-client/ServerErrorMessageClientMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class JoinGameCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(private readonly context: MessageHandlerContext) {}

	execute(): void {
		const body = this.context.readBody(this.context.messageLength());
		const joinGameMessage = new JoinGameMessage(body);
		const room = RoomList.getRooms().find((room) => room.id === joinGameMessage.id);

		if (!room) {
			this.context.socket.write(
				ServerErrorClientMessage.create("Sala no encontrada. Intenta recargando la lista")
			);

			this.context.socket.destroy();

			return;
		}

		const joinToGame = new JoinToGame(this.context.socket);
		const playerInfoMessage = this.context.getPreviousMessages() as PlayerInfoMessage;

		const reconnectingClient = room.clients.find(
			(client) =>
				client.socket.remoteAddress === this.context.socket.remoteAddress &&
				playerInfoMessage.name === client.name
		);

		if (reconnectingClient) {
			const reconnectToGame = new ReconnectToGame(this.context.socket, new RoomFinder());
			reconnectToGame.run(joinGameMessage, playerInfoMessage.name, reconnectingClient);

			return;
		}

		joinToGame.run(joinGameMessage, playerInfoMessage.name, room);
	}
}
