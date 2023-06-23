import net from "net";

import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { DuelStartClientMessage } from "../../messages/server-to-client/DuelStartClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { DuelState } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";

export class JoinToGameAsExpectator {
	constructor(private readonly socket: net.Socket) {}

	run(message: JoinGameMessage, playerName: string): void {
		const room = RoomList.getRooms().find((room) => room.id === message.id);
		if (!room || room.duelState !== DuelState.DUELING) {
			return;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: playerName,
			position: 3,
			roomId: room.id,
			team: 3,
		});

		room.addSpectator(client);

		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		this.socket.write(TypeChangeClientMessage.create({ type: 0x07 }));

		room.clients.forEach((item) => {
			const status = (item.position << 4) | 0x09;
			item.socket.write(PlayerEnterClientMessage.create(item.name, item.position));
			item.socket.write(PlayerChangeClientMessage.create({ status }));
		});

		this.socket.write(DuelStartClientMessage.create());

		this.socket.write(CatchUpClientMessage.create({ catchingUp: true }));

		this.socket.write(CatchUpClientMessage.create({ catchingUp: false }));
	}
}
