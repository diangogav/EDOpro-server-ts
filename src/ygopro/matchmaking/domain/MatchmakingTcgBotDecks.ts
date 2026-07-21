/**
 * Curated pool of TCG-legal deck names for matchmaking bot fallback.
 *
 * Matchmaking v1 rooms are created as TCG (rule 1 + TCG banlist), so a bot
 * dropped into one MUST play a deck that passes the active TCG deck-check —
 * otherwise the duel cannot start and the human is ejected. The server-side
 * botlist (config/botlist.example.json) is format-blind, so the format-correct
 * deck is chosen HERE and passed as a deckOverride when spawning the bot.
 *
 * Each string maps to an existing windbot deck file: windbot normalizes the
 * deck string by stripping spaces and wrapping it as `AI_<DeckNoSpaces>.ydk`
 * (e.g. "Toadally Awesome" -> AI_ToadallyAwesome.ydk). Every entry below was
 * verified against windbot/Decks/AI_*.ydk and windbot/bots.json.
 *
 * IMPORTANT: These must be legal for the active TCG banlist (2026.05); adjust
 * if the deck-check rejects any.
 */
export const MATCHMAKING_TCG_BOT_DECKS: readonly string[] = [
	"Salamangreat", // AI_Salamangreat.ydk
	"SkyStriker", // AI_SkyStriker.ydk
	"Labrynth", // AI_Labrynth.ydk
	"Yubel", // AI_Yubel.ydk
	"Swordsoul", // AI_Swordsoul.ydk
	"Ryzeal", // AI_Ryzeal.ydk
	"Maliss", // AI_Maliss.ydk
];

/**
 * Picks a random deck from the TCG pool. Kept as a tiny helper so the
 * bootstrap wiring stays declarative and the selection is unit-testable.
 */
export function pickRandomTcgBotDeck(random: () => number = Math.random): string {
	const len = MATCHMAKING_TCG_BOT_DECKS.length;
	// Clamp to the last valid index: Math.floor(random() * len) would yield `len`
	// (an out-of-range, undefined element) if random() ever returns exactly 1.0.
	const index = Math.min(Math.floor(random() * len), len - 1);
	return MATCHMAKING_TCG_BOT_DECKS[index];
}
