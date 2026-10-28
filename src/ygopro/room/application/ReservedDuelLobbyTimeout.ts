import { YGOProClient } from "@ygopro/client/domain/YGOProClient";

import { YGOProRoom } from "../domain/YGOProRoom";
import { FinalizeYGOProRoom } from "./FinalizeYGOProRoom";

/**
 * Ends a reserved room whose first duel never started within the
 * reservation's lobby timeout: a no-show of the first missing (or never
 * ready) human seat, or an unavailable bot when every human was ready.
 */
export class ReservedDuelLobbyTimeout {
	static schedule(room: YGOProRoom): NodeJS.Timeout | null {
		const session = room.reservedDuel;
		if (!session) {
			return null;
		}
		const timer = setTimeout(() => ReservedDuelLobbyTimeout.expire(room), session.lobbyTimeoutMs);
		timer.unref?.();

		return timer;
	}

	static expire(room: YGOProRoom): void {
		const session = room.reservedDuel;
		if (!session || room.finalizing || session.hasStarted) {
			return;
		}
		const players = room.players as YGOProClient[];
		const seated = players.filter((player) => !player.socket.closed).map((player) => player.team);
		const ready = players.filter((player) => player.isReady).map((player) => player.team);
		const seat = session.noShowSeat(seated, ready);

		FinalizeYGOProRoom.run(
			room,
			seat === null ? { seat: null, reason: "bot_unavailable" } : { seat, reason: "no_show" },
		);
	}
}
