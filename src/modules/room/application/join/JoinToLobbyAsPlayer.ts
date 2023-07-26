import net from "net";

import { Client } from "../../../client/domain/Client";
import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../messages/client-to-server/PlayerInfoMessage";
import { ServerInfoMessage } from "../../../messages/domain/ServerInfoMessage";
import { ErrorMessages } from "../../../messages/server-to-client/error-messages/ErrorMessages";
import { ErrorClientMessage } from "../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../messages/server-to-client/PlayerEnterClientMessage";
import { ServerMessageClientMessage } from "../../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../../messages/server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../messages/server-to-client/WatchChangeClientMessage";
import { PlayerRoomState } from "../../domain/PlayerRoomState";
import { DuelState, Room } from "../../domain/Room";
import { JoinHandler } from "./JoinHandler";

export class JoinToLobbyAsPlayer implements JoinHandler {
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

		const playerEntering = this.room.clients.find((client) => {
			return (
				client.socket.remoteAddress === this.socket.remoteAddress &&
				this.playerInfo.name === client.name
			);
		});

		if (playerEntering) {
			return ErrorClientMessage.create(ErrorMessages.JOINERROR);
		}

		const place = this.room.calculaPlace();

		if (!place) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: this.playerInfo.name,
			position: place.position,
			roomId: this.room.id,
			team: place.team,
		});

		this.room.addClient(client);
		this.sendJoinMessage(client);
		this.sendNotReadyMessage(client);
		this.sendTypeChangeMessage(client);
		this.sendTypeChangeMessage(client);
		const spectatorsCount = this.room.spectators.length;
		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });
		this.socket.write(watchMessage);

		const host = this.room.clients.find((client) => client.host);

		if (this.room.ranked) {
			this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
			this.socket.write(
				ServerMessageClientMessage.create(ServerInfoMessage.RANKED_ROOM_CREATION_SUCCESS)
			);
			this.socket.write(
				ServerMessageClientMessage.create(ServerInfoMessage.GAIN_POINTS_CALL_TO_ACTION)
			);
		} else {
			this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.WELCOME));
			this.socket.write(
				ServerMessageClientMessage.create(ServerInfoMessage.UNRANKED_ROOM_CREATION_SUCCESS)
			);
			this.socket.write(ServerMessageClientMessage.create(ServerInfoMessage.NOT_GAIN_POINTS));
		}

		if (!host) {
			return null;
		}

		this.notify(client);

		return null;
	}

	private sendJoinMessage(client: Client): void {
		this.socket.write(JoinGameClientMessage.createFromRoom(this.message, this.room));
		this.room.clients.forEach((_client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(this.playerInfo.name, client.position));
		});

		this.room.spectators.forEach((_client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(this.playerInfo.name, client.position));
		});
	}

	private sendNotReadyMessage(client: Client): void {
		const notReady = (client.position << 4) | PlayerRoomState.NOT_READY;
		this.room.clients.forEach((_client) => {
			_client.sendMessage(PlayerChangeClientMessage.create({ status: notReady }));
		});

		this.room.spectators.forEach((_client) => {
			_client.sendMessage(PlayerChangeClientMessage.create({ status: notReady }));
		});
	}

	private sendTypeChangeMessage(client: Client): void {
		const type = (Number(client.host) << 4) | client.position;
		this.socket.write(TypeChangeClientMessage.create({ type }));
	}

	private notify(client: Client): void {
		this.room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = this.room.clients[_client.position].isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				this.socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				this.socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});
	}
}
