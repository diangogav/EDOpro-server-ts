import { Logger } from "@shared/logger/domain/Logger";
import { RoomDisconnectPolicy } from "@shared/room/domain/RoomDisconnectPolicy";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";
import { ISocket } from "@shared/socket/domain/ISocket";
import { YGOProClient } from "@ygopro/client/domain/YGOProClient";
import { AbortMatchmakingRoom } from "@ygopro/matchmaking/application/AbortMatchmakingRoom";
import { YGOProRoom } from "@ygopro/room/domain/YGOProRoom";

import { AbandonBetweenDuels } from "./AbandonBetweenDuels";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

export class YGOProDisconnectPolicy implements RoomDisconnectPolicy {
	handles(room: YgoRoom): boolean {
		return room instanceof YGOProRoom;
	}

	onDisconnect(room: YGOProRoom, socket: ISocket, logger: Logger): void {
		// A matchmaking reservation owns the whole two-player WAITING lobby. If
		// either socket leaves, close the room and release both queue identities;
		// the connected survivor will immediately re-enter the pool client-side.
		if (room.isMatchmaking && room.duelState === DuelState.WAITING) {
			AbortMatchmakingRoom.run(room);
			return;
		}

		if (room.reservedDuel && this.closeReservedDuel(room, socket)) {
			return;
		}

		// On `close` the leaver's socket is already closed, so this also catches
		// the last WAITING player leaving — finalize instead of leaking a zombie.
		if (room.hasNoConnectedPlayers) {
			FinalizeYGOProRoom.run(room);

			return;
		}

		const player = room.players.find((client) => client.socket.id === socket.id);

		if (!(player instanceof YGOProClient)) {
			this.removeSpectator(room, socket);

			return;
		}

		// AI rooms have no second human host, so a single human leaving in ANY phase
		// must tear down the whole room — otherwise the orphaned bot lingers as a zombie.
		if (room.noHost) {
			FinalizeYGOProRoom.run(room);

			return;
		}

		// Between duels the opponent is waiting on the leaver: give them a grace
		// window to reconnect, then cancel or award the match.
		if (AbandonBetweenDuels.playerLeft(room, player, logger)) {
			return;
		}

		if (room.duelState === DuelState.WAITING) {
			room.playerLeave(player);
			player.destroy();
		}
	}

	/**
	 * A reserved duel records who ended it. Without reconnect a human leaving
	 * ends the room at once (as an AI room does); with reconnect only the last
	 * human leaving does, and everything else takes the normal path (lobby
	 * leave, abandon grace between duels, the duel timer mid-duel). The bot
	 * leaving is never a player's fault. Returns whether the leave was handled.
	 */
	private closeReservedDuel(room: YGOProRoom, socket: ISocket): boolean {
		const player = room.players.find((client) => client.socket.id === socket.id);
		if (!(player instanceof YGOProClient)) {
			return false;
		}
		const leaver = player;

		if (leaver.isInternal) {
			FinalizeYGOProRoom.run(room, { seat: null, reason: "bot_unavailable" });
			return true;
		}
		if (room.hasNoConnectedPlayers || this.noHumanLeft(room)) {
			FinalizeYGOProRoom.run(room, { seat: leaver.team, reason: "disconnect" });
			return true;
		}
		if (room.noReconnect) {
			FinalizeYGOProRoom.run(room, { seat: leaver.team, reason: "disconnect" });
			return true;
		}

		return false;
	}

	private noHumanLeft(room: YGOProRoom): boolean {
		return (room.players as YGOProClient[]).every(
			(client) => client.isInternal || client.socket.closed,
		);
	}

	private removeSpectator(room: YGOProRoom, socket: ISocket): void {
		const spectator = room.spectators.find((client) => client.socket.id === socket.id);

		if (!(spectator instanceof YGOProClient)) {
			return;
		}

		room.spectatorLeave(spectator);
		spectator.destroy();
	}
}
