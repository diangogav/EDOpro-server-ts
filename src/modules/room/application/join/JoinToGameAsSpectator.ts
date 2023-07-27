import net from "net";

import { Client } from "../../../client/domain/Client";
import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../messages/client-to-server/PlayerInfoMessage";
import { CatchUpClientMessage } from "../../../messages/server-to-client/CatchUpClientMessage";
import { DuelStartClientMessage } from "../../../messages/server-to-client/DuelStartClientMessage";
import { ErrorClientMessage } from "../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../messages/server-to-client/PlayerEnterClientMessage";
import { ServerMessageClientMessage } from "../../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../../messages/server-to-client/TypeChangeClientMessage";
import { DuelState, Room } from "../../domain/Room";
import { JoinHandler } from "./JoinHandler";

export class JoinToGameAsSpectator implements JoinHandler {
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
		if (
			this.room.duelState !== DuelState.DUELING &&
			this.room.duelState !== DuelState.CHOOSING_ORDER &&
			this.room.duelState !== DuelState.RPS &&
			this.room.duelState !== DuelState.SIDE_DECKING
		) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const reconnectingClient = this.room.clients.find((client) => {
			return (
				client.socket.remoteAddress === this.socket.remoteAddress &&
				this.playerInfo.name === client.name
			);
		});

		if (reconnectingClient) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: this.playerInfo.name,
			position: this.room.nextSpectatorPosition(),
			roomId: this.room.id,
			team: 3,
		});

		this.room.addSpectator(client);

		this.socket.write(JoinGameClientMessage.createFromRoom(this.message, this.room));
		this.socket.write(TypeChangeClientMessage.create({ type: 0x07 }));

		this.room.clients.forEach((item) => {
			const status = (item.position << 4) | 0x09;
			this.socket.write(PlayerEnterClientMessage.create(item.name, item.position));
			this.socket.write(PlayerChangeClientMessage.create({ status }));
		});

		this.socket.write(DuelStartClientMessage.create());

		this.socket.write(CatchUpClientMessage.create({ catchingUp: true }));

		this.room.spectatorCache.forEach((item) => {
			this.socket.write(item);
		});

		this.socket.write(CatchUpClientMessage.create({ catchingUp: false }));

		const team0 = this.room.clients
			.filter((player) => player.team === 0)
			.map((item) => item.name.replace(/\0/g, "").trim());

		const team1 = this.room.clients
			.filter((player) => player.team === 1)
			.map((item) => item.name.replace(/\0/g, "").trim());

		this.socket.write(
			ServerMessageClientMessage.create(`Bienvenido ${client.name.replace(/\0/g, "").trim()}`)
		);
		this.socket.write(
			ServerMessageClientMessage.create(
				`Score: ${team0.join(",")}: ${this.room.matchScore().team0} vs ${team1.join(",")}: ${
					this.room.matchScore().team1
				}`
			)
		);

		[...this.room.clients, ...this.room.spectators].forEach((_client) => {
			_client.sendMessage(
				ServerMessageClientMessage.create(`${client.name} ha ingresado como espectador`)
			);
		});

		return null;
	}
}
