import { Client } from "../../../../client/domain/Client";
import RoomList from "../../../../room/infrastructure/RoomList";
import { PlayerMessageClientMessage } from "../../../server-to-client/PlayerMessageClientMessage";
import { SpectatorMessageClientMessage } from "../../../server-to-client/SpectatorMessageClientMessage";
import { MessageHandlerCommandStrategy } from "../MessageHandlerCommandStrategy";
import { MessageHandlerContext } from "../MessageHandlerContext";

export class ChatCommandStrategy implements MessageHandlerCommandStrategy {
	constructor(private readonly context: MessageHandlerContext) {}

	execute(): void {
		const clients: Client[] = RoomList.getRooms()
			.map((room) => [...room.clients, ...room.spectators])
			.flat();

		const client = clients.find((client) => client.socket.id === this.context.socket.id);

		if (!client) {
			return;
		}

		const room = RoomList.getRooms().find((item) => item.id === client.roomId);

		if (!room) {
			return;
		}

		// const message = this.context.readBody(this.context.messageLength());
		const message = this.context.readBody();
		if (client.isSpectator) {
			const chatMessage = SpectatorMessageClientMessage.create(
				client.name.replace(/\0/g, "").trim(),
				message
			);
			room.clients.forEach((player) => {
				player.socket.write(chatMessage);
			});

			room.spectators.forEach((spectator) => {
				spectator.socket.write(chatMessage);
			});

			return;
		}

		const playerMessage = PlayerMessageClientMessage.create(
			client.name.replace(/\0/g, "").trim(),
			message,
			client.team
		);
		const opponentMessage = PlayerMessageClientMessage.create(
			client.name.replace(/\0/g, "").trim(),
			message,
			Number(!client.team)
		);

		room.clients.forEach((player) => {
			const message = player.team === client.team ? playerMessage : opponentMessage;
			player.socket.write(message);
		});

		room.spectators.forEach((spectator) => {
			spectator.socket.write(opponentMessage);
		});
	}
}
