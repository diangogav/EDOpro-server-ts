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
 *   - the name matches.
 *
 * In casual rooms it is additionally bound to the original location and only
 * takes over a socket already known closed: casual rooms have no PIN, so the
 * remote address is the only credential.
 *
 * Ranked (incl. external/PIN) rooms intentionally do NOT require the socket to
 * be closed. Mobile clients on the raw-TCP path leave a half-open socket when
 * backgrounded — no FIN/RST reaches the server, so `socket.closed` stays false
 * indefinitely (the TCP path has no liveness heartbeat). Requiring it there
 * locked legitimate players out of their own duel. The takeover is safe: the
 * stale socket is destroyed when the new one is attached (Client.setSocket).
 * The residual (someone knowing a legacy player's name takes their seat while
 * it looks live) is the accepted limit of the legacy by-name path, and never
 * reaches a ticket player.
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
		if (client.name !== params.name) {
			return false;
		}
		if (!params.ranked) {
			if (client.socket.remoteAddress !== params.remoteAddress) {
				return false;
			}
			if (!client.socket.closed) {
				return false;
			}
		}
		return true;
	});

	return match ?? null;
}
