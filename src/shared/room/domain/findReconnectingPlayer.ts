import { YgoClient } from "@shared/client/domain/YgoClient";

/**
 * Finds the player that a by-name JOIN is reconnecting to, while a duel is
 * already in progress. This is the WEAK reconnect path used by external
 * clients; the evolution client reconnects through its token instead.
 *
 * A reconnection is granted ONLY when every guard holds:
 *   - the target is NOT strong-auth: ticket players reconnect through their
 *     single-use token, so they are unreachable here (closes the hijack of a
 *     verified player by name, with a stolen PIN or another ticket).
 *   - the target's socket is actually closed: a live session is never taken
 *     over (closes the in-flight hijack of a connected player).
 *   - the name matches, and — in casual rooms — the remote address too.
 *
 * The remaining residual (knowing a legacy player's PIN while it is down) is
 * the accepted limit of the 4-char PIN, and never reaches a ticket player.
 */
export function findReconnectingPlayer(params: {
	players: YgoClient[];
	name: string;
	remoteAddress: string | undefined;
	ranked: boolean;
}): YgoClient | null {
	const match = params.players.find((client) => {
		if (client.isStrongAuth) {
			return false;
		}
		if (!client.socket.closed) {
			return false;
		}
		if (client.name !== params.name) {
			return false;
		}
		if (!params.ranked && client.socket.remoteAddress !== params.remoteAddress) {
			return false;
		}
		return true;
	});

	return match ?? null;
}
