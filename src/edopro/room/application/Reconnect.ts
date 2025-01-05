import { UserAuth } from "src/shared/user-auth/application/UserAuth";
import { UserProfile } from "src/shared/user-profile/domain/UserProfile";

import { PlayerEnterClientMessage } from "../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";

export class Reconnect {
	constructor(private readonly userAuth: UserAuth) {}

	async run(
		playerInfoMessage: PlayerInfoMessage,
		player: Client,
		joinMessage: JoinGameMessage,
		socket: ISocket,
		room: Room
	): Promise<void> {
		if (room.ranked) {
			const user = await this.userAuth.run(playerInfoMessage);

			if (!(user instanceof UserProfile)) {
				socket.send(user as Buffer);
				socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));

				return;
			}
			// if (!player.socket.id || !player.socket.closed) {
			// 	socket.send(ServerErrorClientMessage.create("Ya el jugador se encuentra en la partida."));
			// 	socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
			// 	socket.destroy();

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
