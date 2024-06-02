import { PlayerEnterClientMessage } from "../../../modules/shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../modules/shared/messages/server-to-client/TypeChangeClientMessage";
import { ISocket } from "../../../modules/shared/socket/domain/ISocket";
import { MercuryClient } from "../../client/domain/MercuryClient";
import { MercuryRoom } from "../domain/MercuryRoom";

export class MercuryReconnect {
	static run(player: MercuryClient, room: MercuryRoom, socket: ISocket): void {
		if (!room.joinBuffer) {
			return;
		}
		player.setSocket(socket);
		player.reconnecting();
		player.socket.send(room.joinBuffer);
		const type = player.host ? player.position + 0x10 : player.position;
		player.socket.send(TypeChangeClientMessage.create({ type }));

		room.clients.forEach((player) => {
			player.socket.send(PlayerEnterClientMessage.create(player.name, player.position));
		});
	}
}
