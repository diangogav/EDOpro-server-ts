import net from "net";

import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { PlayerInfoMessage } from "../../messages/client-to-server/PlayerInfoMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { container } from "../../shared/dependency-injection";
import { EventBus } from "../../shared/event-bus/EventBus";
import { ClientEnteredDuringDuelDomainEvent } from "../domain/domain-events/ClientEnteredDuringDuelDomainEvent";
import { RoomFullOfPlayersDomainEvent } from "../domain/domain-events/RoomFullOfPlayers";
import { PlayerRoomState } from "../domain/PlayerRoomState";
import { DuelState, Room } from "../domain/Room";

export class JoinToGame {
	private readonly eventBus: EventBus;

	constructor(private readonly socket: net.Socket) {
		this.eventBus = container.get(EventBus);
	}

	run(message: JoinGameMessage, playerInfo: PlayerInfoMessage, room: Room): void {
		if (room.duelState === DuelState.DUELING) {
			this.eventBus.publish(
				ClientEnteredDuringDuelDomainEvent.DOMAIN_EVENT,
				new ClientEnteredDuringDuelDomainEvent({
					playerName: playerInfo.name,
					socket: this.socket,
					room,
					message,
				})
			);

			return;
		}

		const place = room.calculaPlace();
		if (!place) {
			this.eventBus.publish(
				RoomFullOfPlayersDomainEvent.DOMAIN_EVENT,
				new RoomFullOfPlayersDomainEvent({
					playerName: playerInfo.name,
					socket: this.socket,
					room,
					message,
				})
			);

			return;
		}

		const client = new Client({
			socket: this.socket,
			host: false,
			name: playerInfo.name,
			position: place.position,
			roomId: room.id,
			team: place.team,
		});

		room.addClient(client);

		this.socket.write(JoinGameClientMessage.createFromRoom(message, room));
		room.clients.forEach((_client) => {
			_client.socket.write(PlayerEnterClientMessage.create(playerInfo.name, client.position));
		});

		const notReady = (client.position << 4) | PlayerRoomState.NOT_READY;
		room.clients.forEach((_client) => {
			_client.socket.write(PlayerChangeClientMessage.create({ status: notReady }));
		});

		const type = (Number(client.host) << 4) | client.position;
		this.socket.write(TypeChangeClientMessage.create({ type }));

		const host = room.clients.find((client) => client.host);
		if (!host) {
			return;
		}

		room.clients.forEach((_client) => {
			if (_client.socket.id !== client.socket.id) {
				const status = room.clients[_client.position].isReady
					? (_client.position << 4) | PlayerRoomState.READY
					: (_client.position << 4) | PlayerRoomState.NOT_READY;

				this.socket.write(PlayerEnterClientMessage.create(_client.name, _client.position));
				this.socket.write(PlayerChangeClientMessage.create({ status }));
			}
		});
	}
}
