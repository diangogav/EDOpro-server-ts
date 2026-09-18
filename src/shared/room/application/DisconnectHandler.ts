import { Logger } from "@shared/logger/domain/Logger";

import { Client } from "../../../edopro/client/domain/Client";
import { PlayerChangeClientMessage } from "../../../edopro/messages/server-to-client/PlayerChangeClientMessage";
import { WatchChangeClientMessage } from "../../../edopro/messages/server-to-client/WatchChangeClientMessage";
import { Room } from "../../../edopro/room/domain/Room";
import RoomList from "../../../edopro/room/infrastructure/RoomList";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";
import WebSocketSingleton from "../../../web-socket-server/WebSocketSingleton";
import { ISocket } from "../../socket/domain/ISocket";
import { DuelState } from "../domain/YgoRoom";
import { RoomFinder } from "./RoomFinder";
import { FinalizeYGOProRoom } from "@ygopro/room/application/FinalizeYGOProRoom";
import { AbortMatchmakingRoom } from "@ygopro/matchmaking/application/AbortMatchmakingRoom";
import { MatchmakingQueue } from "@ygopro/matchmaking/application/MatchmakingQueue";

/** A caller that has no logger to inject (e.g. an existing test constructing
 * this handler directly) still gets safe, silent dequeue behavior. */
const NOOP_LOGGER: Logger = {
	debug: () => undefined,
	error: () => undefined,
	info: () => undefined,
	warn: () => undefined,
	child: () => NOOP_LOGGER,
};

export class DisconnectHandler {
	constructor(
		private readonly socket: ISocket,
		private readonly roomFinder: RoomFinder,
		private readonly logger: Logger = NOOP_LOGGER,
	) {}

	run(address?: string): void {
		if (!this.socket.id) {
			return;
		}

		this.dequeueFromMatchmaking();

		const room = this.roomFinder.run(this.socket.id);
		if (!room) {
			return;
		}

		if (room instanceof Room) {
			this.handle(room, address);

			return;
		}
		if (room instanceof YGOProRoom) {
			this.handleYGOPro(room);

			return;
		}
	}

	private handle(room: Room, address?: string): void {
		if (room.hasNoConnectedPlayers) {
			RoomList.deleteRoom(room);
			WebSocketSingleton.getInstance().broadcast({
				action: "REMOVE-ROOM",
				data: room.toRealTimePresentation(),
			});

			return;
		}

		const player = room.players.find((client) => client.socket.id === this.socket.id);

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

			room.players.forEach((client: Client) => {
				client.sendMessage(message);
			});

			room.spectators.forEach((spectator: Client) => {
				spectator.sendMessage(message);
			});

			return;
		}
	}

	/**
	 * A socket is never simultaneously queued and roomed, so this runs before
	 * the room lookup and is a cheap no-op for every roomed or unqueued
	 * disconnect. Singleton access mirrors this file's own `AbortMatchmakingRoom`
	 * precedent instead of threading the queue through every construction site.
	 */
	private dequeueFromMatchmaking(): void {
		if (!MatchmakingQueue.isInitialized()) {
			return;
		}
		const dequeued = MatchmakingQueue.getInstance().dequeueBySocketId(this.socket.id as string);
		if (dequeued) {
			this.logger.info("matchmaking.dequeued", { reason: "disconnect" });
		}
	}

	private handleYGOPro(room: YGOProRoom): void {
		// A matchmaking reservation owns the whole two-player WAITING lobby. If
		// either socket leaves, close the room and release both queue identities;
		// the connected survivor will immediately re-enter the pool client-side.
		if (room.isMatchmaking && room.duelState === DuelState.WAITING) {
			AbortMatchmakingRoom.run(room);
			return;
		}

		// On `close` the leaver's socket is already closed, so this also catches
		// the last WAITING player leaving — finalize instead of leaking a zombie.
		if (room.hasNoConnectedPlayers) {
			FinalizeYGOProRoom.run(room);

			return;
		}

		const player = room.players.find((client) => client.socket.id === this.socket.id);

		if (!(player instanceof YGOProClient)) {
			this.removeMercurySpectator(room);

			return;
		}

		// AI rooms have no second human host, so a single human leaving in ANY phase
		// must tear down the whole room — otherwise the orphaned bot lingers as a zombie.
		if (room.noHost) {
			FinalizeYGOProRoom.run(room);

			return;
		}

		if (room.duelState === DuelState.WAITING) {
			room.playerLeave(player);
			player.destroy();
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

	private removeMercurySpectator(room: YGOProRoom): void {
		const spectator = room.spectators.find((client) => client.socket.id === this.socket.id);

		if (!(spectator instanceof YGOProClient)) {
			return;
		}

		room.spectatorLeave(spectator);
		spectator.destroy();
	}
}
