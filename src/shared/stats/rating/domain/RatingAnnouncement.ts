export const MAX_LENGTH = 20;

const PREFIX = "[Rating v1 ";
const TEAMMATE_SEPARATOR = " · ";
const TEAM_SEPARATOR = " | ";
const ELLIPSIS = "…";
// biome-ignore lint/suspicious/noControlCharactersInRegex: strips NUL and other C0/DEL control chars from nicknames
const CONTROL_CHARS = /[\x00-\x1f\x7f]/g;
const GRAMMAR_SEPARATORS = /[·|]/g;
const WHITESPACE_RUNS = /\s+/g;

export type RatingAnnouncementEntry = {
	name: string;
	rating: number;
};

export type RatingAnnouncementDeltaEntry = RatingAnnouncementEntry & {
	delta: number;
};

export function formatStart(teams: RatingAnnouncementEntry[][]): string {
	return formatFrame("start", teams, formatEntry);
}

export function formatEnd(teams: RatingAnnouncementDeltaEntry[][]): string {
	return formatFrame("end", teams, formatDeltaEntry);
}

function formatFrame<T>(
	kind: "start" | "end",
	teams: T[][],
	formatOne: (entry: T) => string,
): string {
	const body = teams
		.map((team) => team.map(formatOne).join(TEAMMATE_SEPARATOR))
		.join(TEAM_SEPARATOR);

	return `${PREFIX}${kind}] ${body}`;
}

function formatEntry(entry: RatingAnnouncementEntry): string {
	return `${sanitizeName(entry.name)} ${Math.round(entry.rating)}`;
}

function formatDeltaEntry(entry: RatingAnnouncementDeltaEntry): string {
	const sign = entry.delta >= 0 ? "+" : "-";
	const magnitude = Math.round(Math.abs(entry.delta));

	return `${formatEntry(entry)} (${sign}${magnitude})`;
}

function sanitizeName(name: string): string {
	const cleaned = name
		.replace(CONTROL_CHARS, "")
		.replace(GRAMMAR_SEPARATORS, " ")
		.replace(WHITESPACE_RUNS, " ")
		.trim();

	return truncateName(cleaned);
}

function truncateName(name: string): string {
	if (name.length <= MAX_LENGTH) {
		return name;
	}

	let cut = MAX_LENGTH;
	const boundaryUnit = name.charCodeAt(cut - 1);
	const boundaryIsHighSurrogate = boundaryUnit >= 0xd800 && boundaryUnit <= 0xdbff;
	if (boundaryIsHighSurrogate) {
		cut -= 1;
	}

	return `${name.slice(0, cut)}${ELLIPSIS}`;
}
