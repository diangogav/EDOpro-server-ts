import { YgoClient } from "@shared/client/domain/YgoClient";

/**
 * Whether a player with this name is already seated in the room. Used in the
 * WAITING lobby to reject duplicate names, so a later by-name reconnect can
 * never be ambiguous. This is purely a name check — it has nothing to do with
 * reconnection (that is findReconnectingPlayer).
 */
export function isNameTaken(players: YgoClient[], name: string): boolean {
	return players.some((client) => client.name === name);
}
