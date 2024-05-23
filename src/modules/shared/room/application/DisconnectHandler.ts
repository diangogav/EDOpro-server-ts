import { MercuryClient } from "../../../../mercury/client/domain/MercuryClient";
import { MercuryRoom } from "../../../../mercury/room/domain/MercuryRoom";
import { YGOClientSocket } from "../../../../socket-server/HostServer";
import WebSocketSingleton from "../../../../web-socket-server/WebSocketSingleton";
import { Client } from "../../../client/domain/Client";
import { PlayerChangeClientMessage } from "../../../messages/server-to-client/PlayerChangeClientMessage";
import { ServerMessageClientMessage } from "../../../messages/server-to-client/ServerMessageClientMessage";
import { WatchChangeClientMessage } from "../../../messages/server-to-client/WatchChangeClientMessage";
import { Room } from "../../../room/domain/Room";
import RoomList from "../../../room/infrastructure/RoomList";
import { DuelState } from "../domain/YgoRoom";
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

		if (room instanceof Room) {
			this.handle(room, address);

			return;
		}
		if (room instanceof MercuryRoom) {
			this.handleMercury(room);

			return;
		}
	}

	private handle(room: Room, address?: string): void {
		if (room.clients.every((client) => client.socket.closed)) {
			RoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});

			return;
		}

		const player = room.clients.find((client) => client.socket.id === this.socket.id);

		if (!(player instanceof Client)) {
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

			room.clients.forEach((client: Client) => {
				client.sendMessage(message);
			});

			room.spectators.forEach((spectator) => {
				spectator.sendMessage(message);
			});

			return;
		}

		if (address) {
			room.clients.forEach((client: Client) => {
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

	private handleMercury(room: MercuryRoom): void {
		const player = room.clients.find((client) => client.socket.id === this.socket.id);

		if (!(player instanceof MercuryClient)) {
			this.removeMercurySpectator(room);

			return;
		}

		player.destroy();
		room.removePlayer(player);
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

		room.clients.forEach((_client: Client) => {
			_client.sendMessage(message);
		});

		room.spectators.forEach((_client) => {
			_client.sendMessage(message);
		});
	}

	private removeMercurySpectator(room: MercuryRoom): void {
		const spectator = room.spectators.find((client) => client.socket.id === this.socket.id);

		if (!spectator) {
			return;
		}

		room.removeSpectator(spectator);
	}
}
