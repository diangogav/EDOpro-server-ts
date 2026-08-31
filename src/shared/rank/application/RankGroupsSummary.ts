import { RankGroupsConfig } from "../domain/RankGroupConfig";
import { currentListsFor, resolveAlias } from "../domain/RankGroupResolution";

/**
 * One boot-log line showing which loaded banlists feed each enabled group
 * right now, e.g. `🏆 Rank groups → TCG: 2026.05 TCG · Speed: (no loaded list)`.
 * Loaded names are alias-resolved before matching, mirroring the resolver.
 * Returns null when no group is enabled, so boot logs nothing.
 */
export function formatRankGroupsSummary(
	config: RankGroupsConfig,
	loadedBanListNames: string[],
	today: Date,
): string | null {
	const enabledGroups = config.groups.filter((group) => group.enabled);
	if (enabledGroups.length === 0) {
		return null;
	}

	const resolvedNames = loadedBanListNames.map((name) => resolveAlias(name, config.aliases));
	const segments = enabledGroups.map((group) => {
		const { current } = currentListsFor(group, resolvedNames, today);

		return `${group.name}: ${current.length === 0 ? "(no loaded list)" : current.join(" + ")}`;
	});

	return `🏆 Rank groups → ${segments.join(" · ")}`;
}
