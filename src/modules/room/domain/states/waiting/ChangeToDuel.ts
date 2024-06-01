import { Client } from "../../../../client/domain/Client";
import { PlayerChangeClientMessage } from "../../../../messages/server-to-client/PlayerChangeClientMessage";
import { WatchChangeClientMessage } from "../../../../messages/server-to-client/WatchChangeClientMessage";
import { PlayerEnterClientMessage } from "../../../../shared/messages/server-to-client/PlayerEnterClientMessage";
import { TypeChangeClientMessage } from "../../../../shared/messages/server-to-client/TypeChangeClientMessage";
import { PlayerRoomState } from "../../PlayerRoomState";
import { Room } from "../../Room";

export class ChangeToDuel {
	execute(room: Room, player: Client): void {
		const place = room.calculaPlace();
		const ips = player.socket.remoteAddress;

		if (place === null) {
			return;
		}

		if (player.isSpectator && !room.kick.find((kick) => kick.socket.remoteAddress === ips)) {
			room.removeSpectator(player);
			room.clients.push(player);
			this.sendPlayerEnterMessage(room, player, place);
			this.sendPlayerChangeMessage(room, player);
			this.sendWatchMessage(room);

			player.playerPosition(place.position, place.team);
			player.notReady();
			const type = (Number(player.host) << 4) | player.position;
			player.sendMessage(TypeChangeClientMessage.create({ type }));

			return;
		}

		if (!room.kick.find((kick) => kick.socket.remoteAddress === ips)) {
			const nextPlace = room.nextAvailablePosition(player.position);
			if (!nextPlace) {
				return;
			}
			player.notReady();
			this.sendPlayerCellChange(room, player, nextPlace);
			this.sendPlayerChangeMessage(room, player);
			player.playerPosition(nextPlace.position, nextPlace.team);
			const type = (Number(player.host) << 4) | player.position;
			player.sendMessage(TypeChangeClientMessage.create({ type }));
		}
	}

	private sendPlayerEnterMessage(
		room: Room,
		client: Client,
		place: { position: number; team: number }
	): void {
		room.clients.forEach((_client: Client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(client.name, place.position));
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(PlayerEnterClientMessage.create(client.name, place.position));
		});
	}

	private sendPlayerCellChange(
		room: Room,
		client: Client,
		place: { position: number; team: number }
	): void {
		room.clients.forEach((_client: Client) => {
			const status = (client.position << 4) | place.position;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});

		room.spectators.forEach((_client: Client) => {
			const status = (client.position << 4) | place.position;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});
	}

	private sendPlayerChangeMessage(room: Room, client: Client): void {
		room.clients.forEach((_client: Client) => {
			const status = (client.position << 4) | PlayerRoomState.NOT_READY;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});

		room.spectators.forEach((_client: Client) => {
			const status = (client.position << 4) | PlayerRoomState.NOT_READY;

			_client.sendMessage(PlayerChangeClientMessage.create({ status }));
		});
	}

	private sendWatchMessage(room: Room): void {
		const spectatorsCount = room.spectators.length;
		const watchMessage = WatchChangeClientMessage.create({ count: spectatorsCount });

		room.clients.forEach((_client: Client) => {
			_client.sendMessage(watchMessage);
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(watchMessage);
		});
	}
}
