import { CheckIfUseCanJoin } from "src/shared/user-auth/application/CheckIfUserCanJoin";

import { PlayerEnterClientMessage } from "../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../shared/socket/domain/ISocket";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { ErrorClientMessage } from "../../messages/server-to-client/ErrorClientMessage";
import { ErrorMessages } from "../../messages/server-to-client/error-messages/ErrorMessages";
import { Room } from "../domain/Room";

export class Reconnect {
	constructor(private readonly checkIfUseCanJoin: CheckIfUseCanJoin) {}

	async run(
		playerInfoMessage: PlayerInfoMessage,
		player: Client,
		joinMessage: JoinGameMessage,
		socket: ISocket,
		room: Room,
	): Promise<void> {
		if (room.ranked && !(await this.checkIfUseCanJoin.check(playerInfoMessage, socket))) {
			// CheckIfUseCanJoin no longer sends the JOINERROR itself (its wire format is
			// client-specific). edopro/desktop clients use the @edopro ErrorClientMessage.
			socket.send(ErrorClientMessage.create(ErrorMessages.JOIN_ERROR));
			return;
		}

		player.setSocket(socket, room.players as Client[], room);
		player.reconnecting();
		player.sendMessage(JoinGameClientMessage.createFromRoom(joinMessage, room));
		const type = (Number(player.host) << 4) | player.position;
		const typeChangeMessage = TypeChangeClientMessage.create({ type });
		player.sendMessage(typeChangeMessage);
		room.players.forEach((_client) => {
			const playerEnterClientMessage = PlayerEnterClientMessage.create(
				_client.name,
				_client.position,
			);
			player.sendMessage(playerEnterClientMessage);
		});
	}
}
