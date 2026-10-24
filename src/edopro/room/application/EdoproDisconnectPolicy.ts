import { Client } from "@edopro/client/domain/Client";
import { PlayerChangeClientMessage } from "@edopro/messages/server-to-client/PlayerChangeClientMessage";
import { WatchChangeClientMessage } from "@edopro/messages/server-to-client/WatchChangeClientMessage";
import { Room } from "@edopro/room/domain/Room";
import RoomList from "@edopro/room/infrastructure/RoomList";
import { RoomDisconnectPolicy } from "@shared/room/domain/RoomDisconnectPolicy";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";

import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";

export class EdoproDisconnectPolicy implements RoomDisconnectPolicy {
	handles(room: YgoRoom): boolean {
		return room instanceof Room;
	}

	onDisconnect(room: Room, socket: ISocket): void {
		if (room.hasNoConnectedPlayers) {
			RoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});

			return;
		}

		const player = room.players.find((client) => client.socket.id === socket.id);

		if (!(player instanceof Client)) {
			this.removeSpectator(room, socket);

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

			room.players.forEach((client: Client) => {
				client.sendMessage(message);
			});

			room.spectators.forEach((spectator: Client) => {
				spectator.sendMessage(message);
			});

			return;
		}
	}

	private removeSpectator(room: Room, socket: ISocket): void {
		const spectator = room.spectators.find((client) => client.socket.id === socket.id);
		if (!(spectator instanceof Client)) {
			return;
		}
		room.removeSpectator(spectator);
		spectator.socket.removeAllListeners();

		const message = WatchChangeClientMessage.create({
			count: room.spectators.length,
		});

		room.players.forEach((_client: Client) => {
			_client.sendMessage(message);
		});

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(message);
		});

		if (room.hasNoConnectedPlayers && room.spectators.length === 0) {
			RoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});
		}
	}
}
