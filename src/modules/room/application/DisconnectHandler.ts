import { YGOClientSocket } from "../../../socket-server/HostServer";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { WatchChangeClientMessage } from "../../messages/server-to-client/WatchChangeClientMessage";
import ReconnectingPlayers from "../../shared/ReconnectingPlayers";
import { DuelState, Room } from "../domain/Room";
import RoomList from "../infrastructure/RoomList";
import { RoomFinder } from "./RoomFinder";

export class DisconnectHandler {
	constructor(private readonly socket: YGOClientSocket, private readonly roomFinder: RoomFinder) {}

	run(address?: string): void {
		if (!this.socket.id) {
			return;
		}

		const room = this.roomFinder.run(this.socket.id);
		if (!room) {
			return;
		}

		const player = room.clients.find((client) => client.socket.id === this.socket.id);

		if (!player) {
			this.removeSpectator(room);

			return;
		}

		if (player.host && room.duelState === DuelState.WAITING) {
			RoomList.deleteRoom(room);

			return;
		}

		if (room.duelState === DuelState.WAITING) {
			room.removePlayer(player);
			const status = (player.position << 4) | 0xb;
			const message = PlayerChangeClientMessage.create({ status });
			room.clients.forEach((client) => {
				client.socket.write(message);
			});

			return;
		}

		if (address) {
			ReconnectingPlayers.add({
				address,
				socketId: this.socket.id,
				position: player.position,
			});

			room.clients.forEach((client) => {
				client.socket.write(
					ServerMessageClientMessage.create(
						`${player.name.replace(/\0/g, "").trim()} ha salido del duelo`
					)
				);
			});

			room.spectators.forEach((spectator) => {
				spectator.socket.write(
					ServerMessageClientMessage.create(
						`${player.name.replace(/\0/g, "").trim()} ha salido del duelo`
					)
				);
			});
		}
	}

	private removeSpectator(room: Room): void {
		const spectator = room.spectators.find((client) => client.socket.id === this.socket.id);
		if (!spectator) {
			return;
		}
		room.removeSpectator(spectator);

		const message = WatchChangeClientMessage.create({
			count: room.spectators.length,
		});

		room.clients.forEach((_client) => {
			_client.socket.write(message);
		});

		room.spectators.forEach((_client) => {
			_client.socket.write(message);
		});
	}
}
