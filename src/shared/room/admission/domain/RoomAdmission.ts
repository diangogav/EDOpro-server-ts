import { Admission } from "./Admission";
import { PlayerCredential } from "./PlayerCredential";
import { RoomLeague } from "./RoomLeague";
import { Seat } from "./Seat";

/**
 * The minimum a room must expose for an admission decision — nothing about
 * sockets, messages or persistence. Keeping the policy free of those is what
 * makes it a pure, table-testable function.
 */
export interface AdmissionContext {
	readonly league: RoomLeague;
	readonly freeSeat: Seat | null;
}

/**
 * The single source of truth for "can this client be admitted, and how?".
 *
 * Pure function, no side effects. The whole business contract lives in these
 * three steps, in order:
 *
 *   1. Ranked rooms require an account even to WATCH → a guest is rejected.
 *   2. A client only SITS if the league admits its credential (segregation,
 *      with the verified→External one-way cross); otherwise it watches.
 *   3. When admitted, sit if there is a free seat, else watch.
 *
 * Mental model — two keys: the door (handled upstream + step 1) and the seat
 * (steps 2-3). "Wrong method → watch" and "room full → watch" are the same
 * thing: you have the door, not the seat.
 */
export class RoomAdmission {
	decide(credential: PlayerCredential, context: AdmissionContext): Admission {
		if (context.league.isRanked && credential.kind === "guest") {
			return { kind: "rejected", reason: "ranked-requires-account" };
		}

		if (!context.league.admitsAsPlayer(credential)) {
			return { kind: "spectator" };
		}

		return context.freeSeat
			? { kind: "player", credential, seat: context.freeSeat }
			: { kind: "spectator" };
	}
}
