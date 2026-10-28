import { randomBytes } from "crypto";

import { Reservation } from "@shared/reserved-duel/domain/Reservation";

import { formatRuleMappings } from "./RuleMappings";

/**
 * The room command a reservation builds: its format token, plus the match
 * token for best-of-3, behind a random password. Nothing else from the
 * client or the reservation reaches the rule parser. Null when the format is
 * not a known format token.
 */
export function reservedRoomCommand(
	reservation: Pick<Reservation, "format" | "mode">,
): string | null {
	const knownFormat = Object.values(formatRuleMappings).some((mapping) =>
		mapping.validate(reservation.format),
	);
	if (!knownFormat) {
		return null;
	}
	const tokens = reservation.mode === "match" ? [reservation.format, "m"] : [reservation.format];

	return `${tokens.join(",")}#${randomBytes(8).toString("hex")}`;
}
