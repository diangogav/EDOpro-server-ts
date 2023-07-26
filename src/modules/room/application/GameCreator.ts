import net from "net";

import { Client } from "../../client/domain/Client";
import { CreateGameMessage } from "../../messages/client-to-server/CreateGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { ServerInfoMessage } from "../../messages/domain/ServerInfoMessage";
import { CreateGameClientMessage } from "../../messages/server-to-client/CreateGameClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class GameCreator {
	private readonly HOST_CLIENT = 0x10;
	constructor(private readonly socket: net.Socket) {}
	run(message: CreateGameMessage, playerInfo: PlayerInfoMessage): void {
		const room = Room.createFromCreateGameMessage(message, playerInfo, this.generateUniqueId());
		const client = new Client({
			socket: this.socket,
			host: true,
			name: playerInfo.name,
			position: 0,
			roomId: room.id,
			team: 0,
		});
		room.addClient(client);
		RoomList.addRoom(room);
		room.createMatch();

		this.socket.write(CreateGameClientMessage.create(room));
		this.socket.write(JoinGameClientMessage.createFromCreateGameMessage(message));
		this.socket.write(PlayerEnterClientMessage.create(playerInfo.name, client.position));
		this.socket.write(PlayerChangeClientMessage.create({}));
		this.socket.write(TypeChangeClientMessage.create({ type: this.HOST_CLIENT }));

		if (room.ranked) {
			this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
			this.socket.write(
				ServerMessageClientMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS)
			);
			this.socket.write(
				ServerMessageClientMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION)
			);

			return;
		}

		this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
		this.socket.write(
			ServerMessageClientMessage.create(ServerInfoMessage.UNRANKED_ROOM_CREATION_SUCCESS)
		);
		this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
	}

	private generateUniqueId(): number {
		const min = 1000;
		const max = 9999;

		return Math.floor(Math.random() * (max - min + 1)) + min;
	}
}
