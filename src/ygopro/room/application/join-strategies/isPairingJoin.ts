import { isRecognizedToken } from "../../domain/RuleMappings";
import { JoinContext } from "./JoinStrategy";

/**
 * Pairing join predicate — for any client that sends a bare token command
 * (e.g. "TCG", "edison") expecting to be matched with another player who sent
 * exactly the same command.
 *
 * A join is a PAIRING JOIN when:
 *   - the password segment is empty (no "#" in the command, or nothing after it)
 *   - the command is non-empty
 *   - every comma-separated token (trimmed, lowercased) is recognized:
 *     isRecognizedToken(token) OR token === "casual"
 *
 * Deliberately NOT pairing joins:
 *   - "ai" — WindBotJoinStrategy intercepts it earlier when windbot is enabled;
 *     when disabled it falls through here and is unrecognized (conservative).
 *   - "mm<...>" (matchmaking's generated join string) — unrecognized token.
 *   - arbitrary player-chosen room names — unrecognized token.
 *   - the blank command — no token can be "every token recognized" vacuously
 *     here because an empty command is rejected outright before the token scan.
 */
export function isPairingJoin(ctx: JoinContext): boolean {
	if (ctx.password !== "") {
		return false;
	}
	if (ctx.command === "") {
		return false;
	}

	// A trailing or double comma ("tcg,", "tcg,,ns") produces empty tokens
	// after split(","). isRecognizedToken("") is false and "" is not "casual",
	// so an empty token would silently disqualify the WHOLE command from
	// pairing even when every other token was recognized. Filtering empties
	// out classifies by the non-empty tokens instead. This is purely a
	// classification concern — the pairing LOOKUP KEY (used by
	// findOrCreateRoom) stays the raw, unfiltered ctx.command string, so
	// "tcg," still only pairs with another literal "tcg,", never with "tcg".
	const tokens = ctx.command
		.split(",")
		.map((token) => token.trim().toLowerCase())
		.filter((token) => token !== "");

	// Every token was empty (e.g. "," or ",,") — nothing to recognize, so
	// `.every()` would otherwise be vacuously true. Not a pairing join.
	if (tokens.length === 0) {
		return false;
	}

	return tokens.every((token) => isRecognizedToken(token) || token === "casual");
}
