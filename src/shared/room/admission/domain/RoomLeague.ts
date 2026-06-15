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

	/**
	 * Which league a room is born into, from how its host created it. Centralizes
	 * the rule that used to live as `casual ? false : (rankedOverride ?? hasPin)`
	 * and additionally distinguishes the ranked TYPE by its source:
	 *   - explicit `casual` flag wins → Casual
	 *   - ticket host (rankedOverride === true) → Verified
	 *   - explicit non-ranked override (=== false) → Casual (e.g. rooms vs bot)
	 *   - PIN host (no override) → External
	 *   - otherwise → Casual
	 */
	static determine(input: {
		casual: boolean;
		rankedOverride: boolean | undefined;
		hasPin: boolean;
	}): RoomLeague {
		if (input.casual) {
			return RoomLeague.Casual;
		}
		if (input.rankedOverride === true) {
			return RoomLeague.Verified;
		}
		if (input.rankedOverride === false) {
			return RoomLeague.Casual;
		}
		return input.hasPin ? RoomLeague.External : RoomLeague.Casual;
	}

	get isRanked(): boolean {
		return this.kind !== "casual";
	}

	/** Stable identifier exposed to the lobby so the client can group rooms by league. */
	get type(): "verified" | "external" | "casual" {
		return this.kind;
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
