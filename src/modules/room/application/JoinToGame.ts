import net from "net";

import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import RoomList from "../infrastructure/RoomList";

export class JoinToGame {
	constructor(private readonly socket: net.Socket) {}

	run(message: JoinGameMessage, playerName: string): void {
		const room = RoomList.getRooms().find((room) => room.id === message.id);
		if (!room) {
			return;
		}
		const client = new Client({
			socket: this.socket,
			host: false,
			name: playerName,
			position: 1,
			roomId: room.id,
			team: 1,
		});
		room.users.push({ pos: client.position, name: playerName });
		room.addClient(client);
		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		room.clients.forEach((_client) => {
			_client.socket.write(PlayerEnterClientMessage.create(playerName, client.position));
		});

		room.clients.forEach((_client) => {
			_client.socket.write(PlayerChangeClientMessage.create({ status: 0x1a }));
		});
		this.socket.write(TypeChangeClientMessage.create({ type: 0x01 }));

		const host = room.clients.find((client) => client.host);
		if (!host) {
			return;
		}

		const status = room.clients[client.position - 1].isReady ? 0x09 : 0x0a;
		this.socket.write(PlayerEnterClientMessage.create(host.name, host.position));
		this.socket.write(PlayerChangeClientMessage.create({ status }));
	}
}
