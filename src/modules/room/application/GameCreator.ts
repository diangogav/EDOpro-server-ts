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
	constructor(private readonly socket: net.Socket) {}
	run(message: CreateGameMessage, playerName: string): void {
		const room = Room.createFromCreateGameMessage(message, playerName);

		room.addClient(new Client(this.socket, true, playerName, 0));
		RoomList.addRoom(room);

		this.socket.write(CreateGameClientMessage.create(room));
		this.socket.write(JoinGameClientMessage.createFromCreateGameMessage(message));
		this.socket.write(PlayerEnterClientMessage.create(playerName, 0));
		this.socket.write(PlayerChangeClientMessage.create());
		this.socket.write(TypeChangeClientMessage.create());
	}
}
