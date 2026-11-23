/**
 * The formats a player can say they play. Same ids as the client's create-room
 * format list, so a challenge can build its room from the format's own command
 * token.
 */
export const PRESENCE_FORMATS = [
	"tcg",
	"ocg",
	"edison",
	"goat",
	"jtp",
	"jtp-adv-2007-03",
	"genesys",
	"rush",
	"pre",
	"speed",
] as const;

export type PresenceFormat = (typeof PRESENCE_FORMATS)[number];

/**
 * The known formats in `value`, deduplicated and in catalogue order, or null
 * when `value` is not an array of strings. Unknown ids are dropped, so a client
 * that knows a newer format still gets the ones this server understands.
 */
export function parsePresenceFormats(value: unknown): PresenceFormat[] | null {
	if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
		return null;
	}

	return PRESENCE_FORMATS.filter((format) => value.includes(format));
}
