import { PlayerCredential } from "./PlayerCredential";

/**
 * The "league" a room belongs to — it decides who may SIT DOWN to play.
 *
 * - `Verified`: ranked, only ticket-authenticated players.
 * - `External`: ranked, only PIN-authenticated players.
 * - `Casual`:   anyone may play.
 *
 * The two ranked leagues are SEGREGATED: a player only sits at the league that
 * matches how they authenticated. A mismatched-but-authenticated client is not
 * rejected here — it falls back to spectating, a decision that belongs to
 * RoomAdmission, not to the league itself.
 */
export class RoomLeague {
	private constructor(private readonly kind: "verified" | "external" | "casual") {}

	static readonly Verified = new RoomLeague("verified");
	static readonly External = new RoomLeague("external");
	static readonly Casual = new RoomLeague("casual");

	get isRanked(): boolean {
		return this.kind !== "casual";
	}

	admitsAsPlayer(credential: PlayerCredential): boolean {
		switch (this.kind) {
			case "casual":
				return true;
			case "verified":
				return credential.kind === "verified";
			case "external":
				return credential.kind === "external";
		}
	}
}
