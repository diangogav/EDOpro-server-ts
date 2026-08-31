import { RankGroupAliases, RankGroupDefinition } from "./RankGroupConfig";

export type BanListDatePrefix = {
	year: number;
	month: number;
	day: number;
};

// Names that are rank concepts of their own and must never feed a group.
const NON_GROUPABLE_NAMES = new Set(["N/A", "Global"]);

// Leading `YYYY.MM` or `YYYY.MM.DD` of an already zero-padded name; the
// prefix must be the whole name or be followed by whitespace.
const DATE_PREFIX_PATTERN = /^(\d{4})\.(\d{2})(?:\.(\d{2}))?(?=\s|$)/;

/**
 * Resolves a banlist header name to its canonical rank name. Applied before
 * any rank lookup so a renamed header keeps feeding the rank its history
 * lives under instead of re-creating a ladder that was merged historically.
 */
export function resolveAlias(name: string, aliases: RankGroupAliases): string {
	return Object.hasOwn(aliases, name) ? aliases[name] : name;
}

/**
 * A `"* X"` member matches any name ending in `" X"` (the suffix must follow
 * a space); any other member string is an exact match. There are no other
 * wildcard forms.
 */
export function memberMatches(banListName: string, member: string): boolean {
	if (member.startsWith("* ")) {
		return banListName.endsWith(` ${member.slice(2)}`);
	}

	return banListName === member;
}

export function parseBanListDatePrefix(name: string): BanListDatePrefix | null {
	const match = DATE_PREFIX_PATTERN.exec(name);
	if (!match) {
		return null;
	}

	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: match[3] === undefined ? 1 : Number(match[3]),
	};
}

// Collapses a date into one comparable integer (YYYYMMDD).
function dateKey(date: BanListDatePrefix): number {
	return date.year * 10000 + date.month * 100 + date.day;
}

// Calendar days compare in UTC so currency flips at a deterministic instant
// regardless of the host timezone.
function todayKey(today: Date): number {
	return today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
}

function matchesGroup(name: string, group: RankGroupDefinition): boolean {
	return group.members.some((member) => memberMatches(name, member));
}

/**
 * Group names the given (already alias-resolved) banlist name feeds.
 *
 * A group resolves when a member matches the name and, for onlyCurrent
 * groups, the name is CURRENT: among the loaded banlist names matching the
 * group with a date not after `today`, it carries the max date. A dateless
 * matching name is always current; a future-dated one never is.
 */
export function resolveGroupsFor(
	banListName: string,
	groups: RankGroupDefinition[],
	loadedBanListNames: string[],
	today: Date,
): string[] {
	if (!banListName || NON_GROUPABLE_NAMES.has(banListName)) {
		return [];
	}

	const referenceKey = todayKey(today);
	const playedDate = parseBanListDatePrefix(banListName);
	const playedKey = playedDate === null ? null : dateKey(playedDate);

	return groups
		.filter((group) => group.enabled)
		.filter((group) => matchesGroup(banListName, group))
		.filter(
			(group) =>
				!group.onlyCurrent || isCurrent(playedKey, group, loadedBanListNames, referenceKey),
		)
		.map((group) => group.name);
}

function isCurrent(
	playedKey: number | null,
	group: RankGroupDefinition,
	loadedBanListNames: string[],
	referenceKey: number,
): boolean {
	if (playedKey === null) {
		return true;
	}
	if (playedKey > referenceKey) {
		return false;
	}

	const maxLoadedKey = maxCurrentDatedKey(group, loadedBanListNames, referenceKey);

	return maxLoadedKey === null || playedKey >= maxLoadedKey;
}

// Max YYYYMMDD key not after the reference day among the loaded names
// matching the group, or null when no such dated match is loaded.
function maxCurrentDatedKey(
	group: RankGroupDefinition,
	loadedBanListNames: string[],
	referenceKey: number,
): number | null {
	const keys = loadedBanListNames
		.filter((name) => matchesGroup(name, group))
		.map(parseBanListDatePrefix)
		.filter((date): date is BanListDatePrefix => date !== null)
		.map(dateKey)
		.filter((key) => key <= referenceKey);

	return keys.length === 0 ? null : Math.max(...keys);
}

/**
 * Splits the loaded (already alias-resolved) banlist names into the ones
 * matching the group's members and the subset feeding it right now: every
 * dateless match plus the max-dated match not after `today`. Future-dated
 * matches are matched but never current. Currency mirrors `resolveGroupsFor`,
 * so a tie on the max date keeps every tied list current.
 */
export function currentListsFor(
	group: RankGroupDefinition,
	loadedNames: string[],
	today: Date,
): { matched: string[]; current: string[] } {
	const matched = loadedNames.filter((name) => matchesGroup(name, group));
	const referenceKey = todayKey(today);
	const maxKey = maxCurrentDatedKey(group, matched, referenceKey);
	const current = matched.filter((name) => {
		if (NON_GROUPABLE_NAMES.has(name)) {
			return false;
		}

		const date = parseBanListDatePrefix(name);

		return date === null ? true : dateKey(date) === maxKey;
	});

	return { matched, current };
}
