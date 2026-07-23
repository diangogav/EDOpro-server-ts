import { MatchmakingFormat } from "./QueueEntry";

export interface BotIdentity {
	readonly name: string;
	readonly deck: string;
}

/**
 * Per-format roster of (name, deck) identity pairs for matchmaking bot fallback.
 *
 * Bot name and deck are ALWAYS chosen from the same pair (identity coherence):
 * Yugi plays Yugi's deck, Joey plays JTP, etc. This replaces the old approach of
 * picking a random name from the windbot list and a deck independently, which
 * could mix identities (e.g. "Yugi" playing a Salamangreat deck).
 *
 * TCG names and decks are verified against config/botlist.example.json:
 *   - "Salamangreat Bot" ↔ AI_Salamangreat.ydk
 *   - "Sky Striker Bot"  ↔ AI_SkyStriker.ydk
 *   - "Labrynth Bot"     ↔ AI_Labrynth.ydk
 *   - "Yubel Bot"        ↔ AI_Yubel.ydk
 *   - "Swordsoul Bot"    ↔ AI_Swordsoul.ydk
 *   - "Ryzeal Bot"       ↔ AI_Ryzeal.ydk
 *   - "Maliss Bot"       ↔ AI_Maliss.ydk
 *
 * JTP roster: Joey plays JTP, Yugi plays Yugi. Both are in the server botlist
 * (config/botlist.example.json) so requestBot will find them by name.
 *
 * IMPORTANT: All deck strings must be legal for the active banlist of that format.
 * Adjust if a deck-check rejects any entry.
 */
export const MATCHMAKING_BOT_ROSTER: Record<MatchmakingFormat, readonly BotIdentity[]> = {
	tcg: [
		{ name: "Salamangreat Bot", deck: "Salamangreat" },
		{ name: "Sky Striker Bot", deck: "SkyStriker" },
		{ name: "Labrynth Bot", deck: "Labrynth" },
		{ name: "Yubel Bot", deck: "Yubel" },
		{ name: "Swordsoul Bot", deck: "Swordsoul" },
		{ name: "Ryzeal Bot", deck: "Ryzeal" },
		{ name: "Maliss Bot", deck: "Maliss" },
	],
	jtp: [
		{ name: "Joey", deck: "JTP" },
		{ name: "Yugi", deck: "Yugi" },
	],
};

/**
 * Picks a bot identity pair from the format's roster using the given random source.
 *
 * The pair is always returned intact: name and deck always come from the same entry,
 * guaranteeing identity coherence. The caller MUST pass `pair.deck` as `deckOverride`
 * to `requestBot` so windbot uses the correct deck and `deckcode` is cleared.
 */
export function pickBotFromRoster(
	format: MatchmakingFormat,
	random: () => number = Math.random,
): BotIdentity {
	const roster = MATCHMAKING_BOT_ROSTER[format];
	const len = roster.length;
	// Clamp to the last valid index: Math.floor(random() * len) would yield `len`
	// (an out-of-range, undefined element) if random() ever returns exactly 1.0.
	const index = Math.min(Math.floor(random() * len), len - 1);
	return roster[index];
}
