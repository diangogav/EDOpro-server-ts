import { randomBytes } from "crypto";

import { Reservation } from "@shared/reserved-duel/domain/Reservation";

import { formatRuleMappings } from "./RuleMappings";

/**
 * The room command a reservation builds: its format token, the match token
 * for best-of-3 and the turn-time token when the issuer set one, behind a
 * random password. Nothing else from the client or the reservation reaches
 * the rule parser. Null when the format is not a known format token.
 */
export function reservedRoomCommand(
	reservation: Pick<Reservation, "format" | "mode" | "options">,
): string | null {
	const knownFormat = Object.values(formatRuleMappings).some((mapping) =>
		mapping.validate(reservation.format),
	);
	if (!knownFormat) {
		return null;
	}
	const tokens = [reservation.format];
	if (reservation.mode === "match") {
		tokens.push("m");
	}
	const turnTime = reservation.options.turnTimeSeconds;
	if (turnTime !== undefined) {
		tokens.push(turnTimeToken(turnTime));
	}

	return `${tokens.join(",")}#${randomBytes(8).toString("hex")}`;
}

// `tm<N>` reads N as minutes up to 60 and as seconds from 61, so whole
// minutes take the minute form and everything else the second form.
function turnTimeToken(seconds: number): string {
	return seconds % 60 === 0 ? `tm${seconds / 60}` : `tm${seconds}`;
}
