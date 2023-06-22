import net from "net";

import { Client } from "../../client/domain/Client";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreator {
	private readonly HOST_CLIENT = 0x10;
	constructor(private readonly socket: net.Socket) {}
	run(message: CreateGameMessage, playerName: string): void {
		const room = Room.createFromCreateGameMessage(message, playerName);
		const client = new Client({
			socket: this.socket,
			host: true,
			name: playerName,
			position: 0,
			roomId: room.id,
			team: 0,
		});
		room.addClient(client);
		RoomList.addRoom(room);
		room.createMatch();

		this.socket.write(CreateGameClientMessage.create(room));
		this.socket.write(JoinGameClientMessage.createFromCreateGameMessage(message));
		this.socket.write(PlayerEnterClientMessage.create(playerName, client.position));
		this.socket.write(PlayerChangeClientMessage.create({}));
		this.socket.write(TypeChangeClientMessage.create({ type: this.HOST_CLIENT }));
	}
}
