import net from "net";

import { Client } from "../../client/domain/Client";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { ClientToServerMessageFactory } from "../../messages/domain/ClientToServerMessageFactory";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreator {
	run(data: Buffer, playerName: string, socket: net.Socket): void {
		const factory = new ClientToServerMessageFactory();
		const createGameBufferMessage = data.subarray(43, data.length);
		const createGameMessage = factory.get(createGameBufferMessage);
		const room = Room.createFromCreateGameMessage(
			createGameMessage as CreateGameMessage,
			playerName
		);

		room.addClient(new Client(socket));
		RoomList.addRoom(room);

		socket.write(CreateGameClientMessage.create(room));
		socket.write(
			JoinGameClientMessage.createFromCreateGameMessage(createGameMessage as CreateGameMessage)
		);
	}
}
