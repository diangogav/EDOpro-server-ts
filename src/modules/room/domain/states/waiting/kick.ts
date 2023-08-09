import { Client } from "../../../../client/domain/Client";
import { ClientMessage } from "../../../../messages/MessageProcessor";
import { PlayerChangeClientMessage } from "../../../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerErrorClientMessage } from "../../../../messages/server-to-client/ServerErrorMessageClientMessage";
import { TypeChangeClientMessage } from "../../../../messages/server-to-client/TypeChangeClientMessage";
import { WatchChangeClientMessage } from "../../../../messages/server-to-client/WatchChangeClientMessage";
import { PlayerRoomState } from "../../PlayerRoomState";
import { Room } from "../../Room";

export class Kick {
	private readonly STATUS = 0x24;

	execute(message: ClientMessage, room: Room, client: Client): void {
		const ishost = client.host;
		const positionkick = message.data.readInt8();
		const playerselect = room.clients[positionkick];

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!playerselect) {
			return;
		}

		if (ishost) {
			room.addSpectator(playerselect);
			room.removePlayer(playerselect);
			room.addKick(playerselect);

			room.clients.forEach((_client) => {
				const status = (playerselect.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			room.spectators.forEach((_client) => {
				const status = (playerselect.position << 4) | PlayerRoomState.SPECTATE;

				_client.sendMessage(PlayerChangeClientMessage.create({ status }));
			});

			playerselect.spectatorPosition(room.nextSpectatorPosition());
			playerselect.notReady();
			const type = (Number(playerselect.host) << 4) | playerselect.position;
			playerselect.sendMessage(TypeChangeClientMessage.create({ type }));

			const spectatorsCount = room.spectators.length;
			const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

			room.clients.forEach((_client) => {
				_client.sendMessage(watchMessage);
				_client.sendMessage(
					ServerErrorClientMessage.create(
						`1El Jugador:${playerselect.name} ha sido Baneado de esta Sala, solo podra ingresar como espectador!!`
					)
				);
			});

			room.spectators.forEach((_client) => {
				_client.sendMessage(watchMessage);
				_client.sendMessage(
					ServerErrorClientMessage.create(
						`1El Jugador:${playerselect.name} ha sido Baneado de esta Sala, solo podra ingresar como espectador!!`
					)
				);
			});
		}
	}
}
