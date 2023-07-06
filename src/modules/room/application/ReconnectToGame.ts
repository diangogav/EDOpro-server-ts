import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { RoomFinder } from "./RoomFinder";

export class ReconnectToGame {
	constructor(private readonly socket: YGOClientSocket, private readonly roomFinder: RoomFinder) {}

	run(message: JoinGameMessage, playerName: string, reconnectingClient: Client): void {
		if (!reconnectingClient.socket.id) {
			return;
		}

		const room = this.roomFinder.run(reconnectingClient.socket.id);

		if (!room) {
			return;
		}

		reconnectingClient.setSocket(this.socket, room.clients, room);
		reconnectingClient.reconnecting();
		reconnectingClient.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		const type = reconnectingClient.host ? 0x00 : 0x01;
		const typeChangeMessage = TypeChangeClientMessage.create({ type });
		reconnectingClient.socket.write(typeChangeMessage);
		room.clients.forEach((_client) => {
			const playerEnterClientMessage = PlayerEnterClientMessage.create(
				_client.name,
				_client.position
			);
			reconnectingClient.socket.write(playerEnterClientMessage);
		});
	}
}
