import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../messages/server-to-client/WatchChangeClientMessage";
import { DomainEventSubscriber } from "../../shared/event-bus/EventBus";
import { RoomFullOfPlayersDomainEvent } from "../domain/domain-events/RoomFullOfPlayers";
import { PlayerRoomState } from "../domain/PlayerRoomState";
import { DuelState, Room } from "../domain/Room";

export class JoinToRoomAsSpectator implements DomainEventSubscriber<RoomFullOfPlayersDomainEvent> {
	static readonly ListenTo = RoomFullOfPlayersDomainEvent.DOMAIN_EVENT;

	handle(event: RoomFullOfPlayersDomainEvent): void {
		this.run(event.data.message, event.data.playerName, event.data.room, event.data.socket);
	}

	run(message: JoinGameMessage, playerName: string, room: Room, socket: YGOClientSocket): void {
		if (room.duelState !== DuelState.WAITING) {
			return;
		}

		const client = new Client({
			socket,
			host: false,
			name: playerName,
			position: 7,
			roomId: room.id,
			team: 3,
		});

		room.addSpectator(client);

		socket.write(JoinGameClientMessage.createFromRoom(message, room));
		const type = (Number(client.host) << 4) | client.position;
		socket.write(TypeChangeClientMessage.create({ type }));

		const spectatorsCount = room.spectators.length;

		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients[_client.position].isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});

		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

		room.clients.forEach((_client) => {
			_client.socket.write(watchMessage);
		});

		room.spectators.forEach((_client) => {
			_client.socket.write(watchMessage);
		});
	}
}
