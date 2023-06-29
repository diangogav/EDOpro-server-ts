import net from "net";

import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../messages/server-to-client/WatchChangeClientMessage";
import { PlayerRoomState } from "../domain/PlayerRoomState";
import { DuelState, Room } from "../domain/Room";

export class JoinToRoomAsSpectator {
	constructor(private readonly socket: net.Socket) {}

	run(message: JoinGameMessage, playerName: string, room: Room): void {
		if (room.duelState !== DuelState.WAITING) {
			return;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: playerName,
			position: 7,
			roomId: room.id,
			team: 3,
		});

		room.addSpectator(client);

		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		const type = (Number(client.host) << 4) | client.position;
		this.socket.write(TypeChangeClientMessage.create({ type }));

		const spectatorsCount = room.spectators.length;

		console.log(room.spectators);

		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients[_client.position].isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				this.socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				this.socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});

		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });
		this.socket.write(watchMessage);
	}
}
