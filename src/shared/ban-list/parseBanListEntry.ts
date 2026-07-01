export interface BanListEntry {
	code: number;
	limit: number;
	points: number | undefined;
}

/**
 * Parses a single lflist.conf card line into its columns.
 *
 * Format: `<code> <limit> [points] [-- name comment]`. The optional third
 * numeric column carries Genesys point costs; a `--name` comment in that
 * position is not a number and yields `points: undefined`.
 *
 * Returns null for headers (`!`), comments (`#`), directives (`$`),
 * removal lines (`-`) and anything that is not a `<code> <limit>` entry.
 */
export function parseBanListEntry(line: string): BanListEntry | null {
	const trimmed = line.trim();
	if (
		!trimmed ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("!") ||
		trimmed.startsWith("$") ||
		trimmed.startsWith("-")
	) {
		return null;
	}

	const match = trimmed.match(/^(\d+)\s+(\d+)(?:\s+(\d+))?/);
	if (!match) {
		return null;
	}

	return {
		code: parseInt(match[1], 10),
		limit: parseInt(match[2], 10),
		points: match[3] !== undefined ? parseInt(match[3], 10) : undefined,
	};
}
