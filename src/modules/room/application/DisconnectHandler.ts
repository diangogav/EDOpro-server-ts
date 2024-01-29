import { YGOClientSocket } from "../../../socket-server/HostServer";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { PlayerChangeClientMessage } from "../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerMessageClientMessage } from "../../messages/server-to-client/ServerMessageClientMessage";
import { WatchChangeClientMessage } from "../../messages/server-to-client/WatchChangeClientMessage";
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

		if (room.clients.every((client) => client.socket.closed)) {
			RoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});

			return;
		}

		const player = room.clients.find((client) => client.socket.id === this.socket.id);

		if (!player) {
			this.removeSpectator(room);

			return;
		}

		if (player.host && room.duelState === DuelState.WAITING) {
			RoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});

			return;
		}

		if (room.duelState === DuelState.WAITING) {
			room.removePlayer(player);
			player.socket.removeAllListeners();
			const status = (player.position << 4) | 0xb;
			const message = PlayerChangeClientMessage.create({ status });

			room.clients.forEach((client) => {
				client.sendMessage(message);
			});

			room.spectators.forEach((spectator) => {
				spectator.sendMessage(message);
			});

			return;
		}

		if (address) {
			room.clients.forEach((client) => {
				client.sendMessage(
					ServerMessageClientMessage.create(
						`${player.name.replace(/\0/g, "").trim()} ha salido del duelo`
					)
				);
			});

			room.spectators.forEach((spectator) => {
				spectator.sendMessage(
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
		spectator.socket.removeAllListeners();

		const message = WatchChangeClientMessage.create({
			count: room.spectators.length,
		});

		room.clients.forEach((_client) => {
			_client.sendMessage(message);
		});

		room.spectators.forEach((_client) => {
			_client.sendMessage(message);
		});
	}
}
