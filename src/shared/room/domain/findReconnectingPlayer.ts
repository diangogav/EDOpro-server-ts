import { YgoClient } from "@shared/client/domain/YgoClient";

/**
 * Shared eligibility guards for a by-name mid-duel reconnect, WITHOUT the
 * ranked identity binding. Both the seating finder and the routing predicate
 * agree on these, so the two paths can never diverge:
 *   - the target is NOT strong-auth: ticket players reconnect through their
 *     single-use token, so they are unreachable here (closes the hijack of a
 *     verified player by name, with a stolen PIN or another ticket).
 *   - the name matches.
 *   - in casual rooms, additionally bound to the original location and only
 *     over a socket already known closed: casual rooms have no PIN, so the
 *     remote address is the only credential.
 */
function isReconnectEligibleSeat(
	client: YgoClient,
	params: { name: string; remoteAddress: string | undefined; ranked: boolean },
): boolean {
	if (client.isStrongAuth) {
		return false;
	}
	if (client.name !== params.name) {
		return false;
	}
	if (!params.ranked) {
		return client.socket.remoteAddress === params.remoteAddress && client.socket.closed;
	}

	return true;
}

/**
 * Finds the player that a by-name JOIN is reconnecting to, while a duel is
 * already in progress. This is the WEAK reconnect path used by external
 * clients; the evolution client reconnects through its token instead.
 *
 * On top of the shared guards (isReconnectEligibleSeat, above), ranked rooms
 * bind the seat to the ACCOUNT IDENTITY: a seat whose credential carries a
 * userId (an external/PIN seat) is only handed back to a joiner whose own
 * resolved credential carries the SAME userId. The display name is chosen by
 * the client and is public, so name alone never grants a seat — an
 * identity-less (guest) joiner or a different account is denied and falls
 * through to spectating. A ranked seat with no recorded credential belongs to
 * the legacy flavor that never stores one; it keeps the historical name rule,
 * and that flavor's caller gates ranked reconnects with its own account check.
 *
 * Ranked rooms intentionally do NOT require the socket to be closed. Mobile
 * clients on the raw-TCP path leave a half-open socket when backgrounded — no
 * FIN/RST reaches the server, so `socket.closed` stays false indefinitely (the
 * TCP path has no liveness heartbeat). Requiring it there locked legitimate
 * players out of their own duel; the identity binding above makes liveness
 * unnecessary. When the seat is granted, the stale socket is detached from the
 * seat (listeners removed, replaced by the new one — YGOProRoom.reconnect /
 * Client.setSocket) but NOT destroyed: closing it is a known residual left to
 * the socket's own lifecycle, and the seat's messages flow only to the new
 * socket.
 *
 * `joinerUserId` is a required two-state:
 *   - a string: the joiner resolved to this account id — bind ranked seats.
 *   - null:     the joiner resolved to NO account (guest) — external seats
 *               are denied.
 * A caller that CANNOT resolve identity must not seat anyone and therefore
 * cannot call this at all — it uses isPairingReconnectRoutingEligible
 * (below), which routes without ever returning a seat.
 */
export function findReconnectingPlayer(params: {
	players: YgoClient[];
	name: string;
	remoteAddress: string | undefined;
	ranked: boolean;
	joinerUserId: string | null;
}): YgoClient | null {
	const match = params.players.find((client) => {
		if (!isReconnectEligibleSeat(client, params)) {
			return false;
		}
		if (!params.ranked) {
			return true;
		}

		const seatCredential = client.credential;
		if (seatCredential === null) {
			// Legacy flavor: no credential is ever recorded on the seat, so there
			// is no identity to bind — keep the historical name rule.
			return true;
		}

		// A verified seat never reaches this line (isStrongAuth bailed above), so
		// the only grantable seat is an external one reclaimed by its own account.
		return seatCredential.kind === "external" && seatCredential.userId === params.joinerUserId;
	});

	return match ?? null;
}

/**
 * Whether a pairing join may be ROUTED towards a non-waiting room as a
 * possible reconnect — nothing more. This is the only surface for callers
 * that cannot resolve the joiner's identity (synchronous routing — a PIN
 * needs an async lookup): it deliberately returns a boolean, never a seat, so
 * a routing caller CANNOT seat anyone on eligibility alone. The room's own
 * mid-duel JOIN door re-runs the check with a resolved identity
 * (findReconnectingPlayer) before any seat changes hands.
 */
export function isPairingReconnectRoutingEligible(params: {
	players: YgoClient[];
	name: string;
	remoteAddress: string | undefined;
	ranked: boolean;
}): boolean {
	return params.players.some((client) => isReconnectEligibleSeat(client, params));
}
