import { YGOClientSocket } from "../../../socket-server/HostServer";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import ReconnectingPlayers, { ReconnectInfo } from "../../shared/ReconnectingPlayers";
import { RoomFinder } from "./RoomFinder";

export class ReconnectToGame {
	constructor(private readonly socket: YGOClientSocket, private readonly roomFinder: RoomFinder) {}

	run(message: JoinGameMessage, playerName: string, reconnectInfo: ReconnectInfo): void {
		if (!this.socket.id) {
			return;
		}

		const room = this.roomFinder.run(reconnectInfo.socketId);

		if (!room) {
			return;
		}

		const client = room.clients[reconnectInfo.position];

		client.setSocket(this.socket, room.clients, room);
		client.reconnecting();
		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		const type = client.host ? 0x00 : 0x01;
		const typeChangeMessage = TypeChangeClientMessage.create({ type });
		this.socket.write(typeChangeMessage);
		room.clients.forEach((_client) => {
			const playerEnterClientMessage = PlayerEnterClientMessage.create(
				_client.name,
				_client.position
			);
			client.socket.write(playerEnterClientMessage);
		});
		ReconnectingPlayers.delete(reconnectInfo);
	}
}
