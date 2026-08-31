/** Maps a played banlist header name to the canonical rank name it feeds. */
export type RankGroupAliases = Record<string, string>;

/**
 * One configurable group rank: a persistent ladder fed by every banlist whose
 * name matches one of `members`. A `"* X"` member matches any name ending in
 * `" X"`; any other member string is an exact match.
 */
export type RankGroupDefinition = {
	name: string;
	enabled: boolean;
	onlyCurrent: boolean;
	members: string[];
};

export type RankGroupsConfig = {
	aliases: RankGroupAliases;
	groups: RankGroupDefinition[];
};

export function emptyRankGroupsConfig(): RankGroupsConfig {
	return { aliases: {}, groups: [] };
}
