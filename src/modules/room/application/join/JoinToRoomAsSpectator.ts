import net from "net";

import { Client } from "../../../client/domain/Client";
import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../messages/client-to-server/PlayerInfoMessage";
import { ErrorClientMessage } from "../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../messages/server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../messages/server-to-client/WatchChangeClientMessage";
import { PlayerRoomState } from "../../domain/PlayerRoomState";
import { DuelState, Room } from "../../domain/Room";
import { JoinHandler } from "./JoinHandler";

export class JoinToRoomAsSpectator implements JoinHandler {
	private nextHandler: JoinHandler | null = null;

	constructor(
		private readonly room: Room,
		private readonly socket: net.Socket,
		private readonly playerInfo: PlayerInfoMessage,
		private readonly message: JoinGameMessage
	) {}

	setNextHandler(handler: JoinHandler): JoinHandler {
		this.nextHandler = handler;

		return handler;
	}

	async tryToJoin(): Promise<ErrorClientMessage | null> {
		if (this.room.duelState !== DuelState.WAITING) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const place = this.room.calculaPlace();

		if (place) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: this.playerInfo.name,
			position: 7,
			roomId: this.room.id,
			team: 3,
		});

		this.room.addSpectator(client);

		this.socket.write(JoinGameClientMessage.createFromRoom(this.message, this.room));
		const type = (Number(client.host) << 4) | client.position;
		this.socket.write(TypeChangeClientMessage.create({ type }));

		const spectatorsCount = this.room.spectators.length;

		this.room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = this.room.clients[_client.position].isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				this.socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				this.socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});

		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

		this.room.clients.forEach((_client) => {
			_client.socket.write(watchMessage);
		});

		this.room.spectators.forEach((_client) => {
			_client.socket.write(watchMessage);
		});

		return null;
	}
}
