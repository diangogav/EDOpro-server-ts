import { PlayerEnterClientMessage } from "../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { UserFinder } from "../../user/application/UserFinder";
import { User } from "../../user/domain/User";
import { Room } from "../domain/Room";

export class Reconnect {
	constructor(private readonly userFinder: UserFinder) {}

	async run(
		playerInfoMessage: PlayerInfoMessage,
		player: Client,
		joinMessage: JoinGameMessage,
		socket: ISocket,
		room: Room
	): Promise<void> {
		if (room.ranked) {
			const user = await this.userFinder.run(playerInfoMessage);

			if (!(user instanceof User)) {
				socket.send(user as Buffer);
				socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

				return;
			}
			if (!player.socket.id) {
				return;
			}

			// if (!player.socket.id || !player.socket.closed) {
			// 	return;
			// }
		}

		player.setSocket(socket, room.clients as Client[], room);
		player.reconnecting();
		player.sendMessage(JoinGameClientMessage.createFromRoom(joinMessage, room));
		const type = (Number(player.host) << 4) | player.position;
		const typeChangeMessage = TypeChangeClientMessage.create({ type });
		player.sendMessage(typeChangeMessage);
		room.clients.forEach((_client) => {
			const playerEnterClientMessage = PlayerEnterClientMessage.create(
				_client.name,
				_client.position
			);
			player.sendMessage(playerEnterClientMessage);
		});
	}
}
