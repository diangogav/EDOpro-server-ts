import net from "net";

import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { PlayerRoomState } from "../domain/PlayerRoomState";
import { DuelState } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class JoinToGame {
	constructor(private readonly socket: net.Socket) {}

	run(message: JoinGameMessage, playerName: string): void {
		const room = RoomList.getRooms().find((room) => room.id === message.id);
		if (!room || room.duelState === DuelState.DUELING) {
			return;
		}

		const place = room.calculaPlace();
		if (!place) {
			return;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: playerName,
			position: place.position,
			roomId: room.id,
			team: place.team,
		});

		room.addClient(client);

		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		room.clients.forEach((_client) => {
			_client.socket.write(PlayerEnterClientMessage.create(playerName, client.position));
		});

		const notReady = (client.position << 4) | PlayerRoomState.NOT_READY;
		room.clients.forEach((_client) => {
			_client.socket.write(PlayerChangeClientMessage.create({ status: notReady }));
		});

		const type = (Number(client.host) << 4) | client.position;
		this.socket.write(TypeChangeClientMessage.create({ type }));

		const host = room.clients.find((client) => client.host);
		if (!host) {
			return;
		}

		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients[_client.position].isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				this.socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				this.socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});
	}
}
