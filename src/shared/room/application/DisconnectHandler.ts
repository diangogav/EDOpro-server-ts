import { ServerInfoMessage } from "@edopro/messages/domain/ServerInfoMessage";

import { Client } from "../../../edopro/client/domain/Client";
import { PlayerChangeClientMessage } from "../../../edopro/messages/server-to-client/PlayerChangeClientMessage";
import { ServerMessageClientMessage } from "../../../edopro/messages/server-to-client/ServerMessageClientMessage";
import { WatchChangeClientMessage } from "../../../edopro/messages/server-to-client/WatchChangeClientMessage";
import { Room } from "../../../edopro/room/domain/Room";
import RoomList from "../../../edopro/room/infrastructure/RoomList";
import { MercuryClient } from "../../../mercury/client/domain/MercuryClient";
import { MercuryRoom } from "../../../mercury/room/domain/MercuryRoom";
import MercuryRoomList from "../../../mercury/room/infrastructure/MercuryRoomList";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { ISocket } from "../../socket/domain/ISocket";
import { DuelState } from "../domain/YgoRoom";
import { RoomFinder } from "./RoomFinder";

export class DisconnectHandler {
	constructor(private readonly socket: ISocket, private readonly roomFinder: RoomFinder) {}

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

			room.spectators.forEach((spectator: Client) => {
				spectator.sendMessage(message);
			});

			return;
		}

		if (address) {
			room.clients.forEach((client: Client) => {
				client.sendMessage(
					ServerMessageClientMessage.create(
						`${player.name.replace(/\0/g, "").trim()} ${ServerInfoMessage.HAS_LEFT_THE_DUEL}`
					)
				);
			});

			room.spectators.forEach((spectator: Client) => {
				spectator.sendMessage(
					ServerMessageClientMessage.create(
						`${player.name.replace(/\0/g, "").trim()} ${ServerInfoMessage.HAS_LEFT_THE_DUEL}`
					)
				);
			});
		}
	}

	private handleMercury(room: MercuryRoom): void {
		if (room.clients.every((client) => client.socket.closed)) {
			MercuryRoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});

			return;
		}

		const player = room.clients.find((client) => client.socket.id === this.socket.id);

		if (!(player instanceof MercuryClient)) {
			this.removeMercurySpectator(room);

			return;
		}

		if (room.duelState === DuelState.WAITING) {
			player.destroy();
			room.removePlayer(player);
		}
	}

	private removeSpectator(room: Room): void {
		const spectator = room.spectators.find((client) => client.socket.id === this.socket.id);
		if (!(spectator instanceof Client)) {
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

		room.spectators.forEach((_client: Client) => {
			_client.sendMessage(message);
		});
	}

	private removeMercurySpectator(room: MercuryRoom): void {
		const spectator = room.spectators.find((client) => client.socket.id === this.socket.id);

		if (!(spectator instanceof MercuryClient)) {
			return;
		}

		room.removeSpectator(spectator);
	}
}
