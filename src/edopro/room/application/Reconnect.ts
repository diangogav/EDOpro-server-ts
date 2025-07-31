import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";

import { PlayerEnterClientMessage } from "../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";

export class Reconnect {
	constructor(private readonly checkIfUseCanJoin: CheckIfUseCanJoin) {}

	async run(
		playerInfoMessage: PlayerInfoMessage,
		player: Client,
		joinMessage: JoinGameMessage,
		socket: ISocket,
		room: Room
	): Promise<void> {
		if (room.ranked && !(await this.checkIfUseCanJoin.check(playerInfoMessage, socket))) {
			return;

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
