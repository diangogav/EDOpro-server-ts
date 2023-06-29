import { YGOClientSocket } from "../../../socket-server/HostServer";
import { Client } from "../../client/domain/Client";
import { JoinGameMessage } from "../../messages/client-to-server/JoinGameMessage";
import { CatchUpClientMessage } from "../../messages/server-to-client/CatchUpClientMessage";
import { DuelStartClientMessage } from "../../messages/server-to-client/DuelStartClientMessage";
import { JoinGameClientMessage } from "../../messages/server-to-client/JoinGameClientMessage";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { PlayerEnterClientMessage } from "../../messages/server-to-client/PlayerEnterClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { TypeChangeClientMessage } from "../../messages/server-to-client/TypeChangeClientMessage";
import { DomainEventSubscriber } from "../../shared/event-bus/EventBus";
import { ClientEnteredDuringDuelDomainEvent } from "../domain/domain-events/ClientEnteredDuringDuelDomainEvent";
import { DuelState, Room } from "../domain/Room";

export class JoinToGameAsSpectator
	implements DomainEventSubscriber<ClientEnteredDuringDuelDomainEvent>
{
	static readonly ListenTo = ClientEnteredDuringDuelDomainEvent.DOMAIN_EVENT;

	handle(event: ClientEnteredDuringDuelDomainEvent): void {
		this.run(event.data.message, event.data.playerName, event.data.room, event.data.socket);
	}

	run(message: JoinGameMessage, playerName: string, room: Room, socket: YGOClientSocket): void {
		if (room.duelState !== DuelState.DUELING) {
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
		socket.write(TypeChangeClientMessage.create({ type: 0x07 }));

		room.clients.forEach((item) => {
			const status = (item.position << 4) | 0x09;
			item.socket.write(PlayerEnterClientMessage.create(item.name, item.position));
			item.socket.write(PlayerChangeClientMessage.create({ status }));
		});

		socket.write(DuelStartClientMessage.create());

		socket.write(CatchUpClientMessage.create({ catchingUp: true }));

		room.spectatorCache.forEach((item) => {
			socket.write(item);
		});

		socket.write(CatchUpClientMessage.create({ catchingUp: false }));

		const team0 = room.clients
			.filter((player) => player.team === 0)
			.map((item) => item.name.replace(/\0/g, "").trim());

		const team1 = room.clients
			.filter((player) => player.team === 1)
			.map((item) => item.name.replace(/\0/g, "").trim());

		socket.write(
			ServerMessageClientMessage.create(`Bienvenido ${client.name.replace(/\0/g, "").trim()}`)
		);
		socket.write(
			ServerMessageClientMessage.create(
				`Score: ${team0.join(",")}: ${room.matchScore().team0} vs ${team1.join(",")}: ${
					room.matchScore().team1
				}`
			)
		);
	}
}
