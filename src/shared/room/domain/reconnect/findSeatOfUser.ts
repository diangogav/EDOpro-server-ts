import { YgoClient } from "@shared/client/domain/YgoClient";
import { DuelState, YgoRoom } from "@shared/room/domain/YgoRoom";

export type AccountSeat = { readonly client: YgoClient; readonly room: YgoRoom };

/**
 * The seat an account holds in a match that started, if any: a player (never a
 * spectator) whose credential is `verified` for that account and who has a
 * reconnection token. A seat with a PIN or a guest seat is never returned, even
 * for the same user id, and neither is a room without reconnection (no token).
 * The seat is found whether its socket is still open or not: taking it over
 * from another device is the point.
 */
export function findSeatOfUser(
	rooms: readonly YgoRoom[],
	userId: string,
	owns: (client: YgoClient) => boolean = () => true,
): AccountSeat | null {
	for (const room of rooms) {
		if (room.duelState === DuelState.WAITING) continue;
		const client = room.players.find(
			(player) =>
				player.credential?.kind === "verified" &&
				player.credential.userId === userId &&
				player.reconnectionToken !== null &&
				owns(player),
		);
		if (client) return { client, room };
	}

	return null;
}
