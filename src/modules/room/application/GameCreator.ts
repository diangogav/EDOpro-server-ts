import net from "net";

import { Client } from "../../client/domain/Client";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { ClientToServerMessageFactory } from "../../messages/domain/ClientToServerMessageFactory";
import { Message } from "../../messages/Message";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreator {
	constructor(private readonly socket: net.Socket) {}

	run(data: Buffer, playerName: string): void {
		const createGameMessage = this.parseBufferToMessage(data);
		const room = this.createRoom(createGameMessage, playerName);

		this.socket.write(CreateGameClientMessage.create(room));
		this.socket.write(
			JoinGameClientMessage.createFromCreateGameMessage(createGameMessage as CreateGameMessage)
		);
	}

	private createRoom(createGameMessage: Message, playerName: string) {
		const room = Room.createFromCreateGameMessage(
			createGameMessage as CreateGameMessage,
			playerName
		);

		room.addClient(new Client(this.socket));
		RoomList.addRoom(room);

		return room;
	}

	private parseBufferToMessage(data: Buffer) {
		const factory = new ClientToServerMessageFactory();
		const createGameBufferMessage = data.subarray(43, data.length);
		const createGameMessage = factory.get(createGameBufferMessage);

		return createGameMessage;
	}
}
