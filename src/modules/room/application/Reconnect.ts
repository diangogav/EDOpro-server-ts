import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { UserFinder } from "../../user/application/UserFinder";
import { User } from "../../user/domain/User";
import { Room } from "../domain/Room";

export class Reconnect {
	constructor(private readonly userFinder: UserFinder) {}

	async run(
		playerInfoMessage: PlayerInfoMessage,
		player: Client,
		joinMessage: JoinGameMessage,
		socket: YGOClientSocket,
		room: Room
	): Promise<void> {
		if (room.ranked) {
			const user = await this.userFinder.run(playerInfoMessage);

			if (!(user instanceof User)) {
				socket.write(user as Buffer);
				socket.write(ErrorClientMessage.create(ErrorMessages.JOINERROR));

				return;
			}
			if (!player.socket.id || !player.socket.closed) {
				return;
			}
		}

		player.setSocket(socket, room.clients, room);
		player.reconnecting();
		player.sendMessage(JoinGameClientMessage.createFromRoom(joinMessage, room));
		const type = player.host ? 0x00 : 0x01;
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
