const NO_BAN_LIST = "N/A";

/** The part of RankGroupResolver that maps a ban list to its rank ladders. */
export interface LadderResolver {
	resolveAlias(name: string): string;
	groupsFor(banListName: string): string[];
}

/**
 * A played list feeds its own canonical rank and every group ladder it
 * belongs to; the catalog decides which of those ladders have a row. A match
 * without a ban list feeds no ladder.
 */
export function laddersForBanList(resolver: LadderResolver, banListName: string): string[] {
	if (!banListName || banListName === NO_BAN_LIST) {
		return [];
	}
	const resolved = resolver.resolveAlias(banListName);

	return [...new Set([resolved, ...resolver.groupsFor(resolved)])];
}
