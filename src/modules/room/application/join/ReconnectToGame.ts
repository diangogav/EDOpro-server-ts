import { YGOClientSocket } from "../../../../socket-server/HostServer";
import { JoinGameMessage } from "../../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../../messages/client-to-server/PlayerInfoMessage";
import { ErrorClientMessage } from "../../../messages/server-to-client/ErrorClientMessage";
import { JoinGameClientMessage } from "../../../messages/server-to-client/JoinGameClientMessage";
import { PlayerEnterClientMessage } from "../../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../messages/server-to-client/TypeChangeClientMessage";
import { DuelState, Room } from "../../domain/Room";
import { RoomFinder } from "../RoomFinder";
import { JoinHandler } from "./JoinHandler";

export class ReconnectToGame implements JoinHandler {
	private nextHandler: JoinHandler | null = null;

	constructor(
		private readonly room: Room,
		private readonly socket: YGOClientSocket,
		private readonly playerInfo: PlayerInfoMessage,
		private readonly message: JoinGameMessage,
		private readonly roomFinder: RoomFinder
	) {}

	setNextHandler(handler: JoinHandler): JoinHandler {
		this.nextHandler = handler;

		return handler;
	}

	async tryToJoin(): Promise<ErrorClientMessage | null> {
		const reconnectingClient = this.room.clients.find((client) => {
			return (
				client.socket.remoteAddress === this.socket.remoteAddress &&
				this.playerInfo.name === client.name
			);
		});
		if (
			!(
				(this.room.duelState === DuelState.DUELING ||
					this.room.duelState === DuelState.RPS ||
					this.room.duelState === DuelState.CHOOSING_ORDER ||
					this.room.duelState === DuelState.SIDE_DECKING) &&
				reconnectingClient
			)
		) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		if (!reconnectingClient.socket.id) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		if (!reconnectingClient.socket.closed) {
			return this.nextHandler?.tryToJoin() ?? null;
		}

		const room = this.roomFinder.run(reconnectingClient.socket.id);

		if (!room) {
			return null;
		}

		reconnectingClient.setSocket(this.socket, room.clients, room);
		reconnectingClient.reconnecting();
		reconnectingClient.sendMessage(JoinGameClientMessage.createFromRoom(this.message, room));
		const type = reconnectingClient.host ? 0x00 : 0x01;
		const typeChangeMessage = TypeChangeClientMessage.create({ type });
		reconnectingClient.sendMessage(typeChangeMessage);
		room.clients.forEach((_client) => {
			const playerEnterClientMessage = PlayerEnterClientMessage.create(
				_client.name,
				_client.position
			);
			reconnectingClient.sendMessage(playerEnterClientMessage);
		});

		return null;
	}
}
