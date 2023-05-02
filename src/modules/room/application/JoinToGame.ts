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
		const room = RoomList.getRooms().find((room) => room.id === 1);
		if (!room) {
			return;
		}
		const position = room.users.length;
		room.users.push({ pos: position, name: playerName });
		room.addClient(new Client(this.socket, false, playerName, position));
		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		room.clients.forEach((client) => {
			client.socket.write(PlayerEnterClientMessage.create(playerName, position));
			client.socket.write(PlayerChangeClientMessage.create());
		});
		this.socket.write(TypeChangeClientMessage.create());

		const host = room.clients.find((client) => client.host);
		if (!host) {
			return;
		}
		this.socket.write(PlayerEnterClientMessage.create(host.name, host.position));
		this.socket.write(PlayerChangeClientMessage.create());
	}
}
