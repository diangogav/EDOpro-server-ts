/**
 * Maps lowercase room-join config tokens to the windbot random-pool format
 * they should draw from. Used by WindBotJoinStrategy to resolve which
 * format-scoped pool a bare "ai" (no bot name) join command should roll a
 * random bot from — see WindbotBotlistRepository.pickRandom(format).
 *
 * Resolution mirrors YGOProRoom.create's own tier precedence in
 * RuleMappings.ts: ruleMappings -> formatRuleMappings -> priorityRuleMappings
 * are applied in that order, so a priorityRuleMappings token (tt/toot/tr/
 * tmr/tomr) ALWAYS overrides a formatRuleMappings token (edison/ed/jtp/jm/
 * pre) regardless of which one appears first in the join string. This
 * function replicates that: it scans for a priority-tier match across ALL
 * tokens first, and only falls back to a positional first-match over the
 * format tier when no priority-tier token is present.
 *
 * `pre` maps to "tcg" deliberately, at the format tier — the free-format
 * random opponent should field a real TCG deck, mirroring the client's
 * historical behavior of rolling TCG bots for the free-format card.
 *
 * Both maps are intentionally partial. Remaining TCG-ish tokens
 * (tcgpre/ocgpre/tcgart/ocgart/ot/tcg) are left unmapped for now — they
 * resolve to the generic pool (null) until there's a reason to special-case
 * them.
 *
 * Unknown or absent tokens resolve to null (generic pool, unchanged
 * pre-existing behavior). Lookups use Map (not a plain object) so a
 * password token that collides with a prototype member (e.g. "constructor",
 * "__proto__", "toString") can never resolve to a truthy value.
 */
const PRIORITY_TOKEN_TO_POOL = new Map<string, string>([
	["tt", "tcg"],
	["toot", "tcg"],
	["tr", "tcg"],
	["tmr", "tcg"],
	["tomr", "tcg"],
]);

const FORMAT_TOKEN_TO_POOL = new Map<string, string>([
	["jtp", "jtp"],
	["jm", "jtp"],
	["edison", "edison"],
	["ed", "edison"],
	["pre", "tcg"],
]);

export function resolveBotPool(tokens: string[]): string | null {
	const lowerTokens = tokens.map((token) => token.toLowerCase());

	for (const token of lowerTokens) {
		const pool = PRIORITY_TOKEN_TO_POOL.get(token);
		if (pool) {
			return pool;
		}
	}

	for (const token of lowerTokens) {
		const pool = FORMAT_TOKEN_TO_POOL.get(token);
		if (pool) {
			return pool;
		}
	}

	return null;
}
