import { AchievementPointsRow } from "./buildReconciliationReport";
import { GroupsFor, RanksByName, ResolveAlias } from "./planLedgerBackfill";

const GLOBAL_RANK_NAME = "Global";
const NO_BAN_LIST_RANK_NAME = "N/A";

export type UnmappedAchievementLabel = {
	label: string;
	occurrences: number;
};

export type FanOutAchievementPointsResult = {
	rows: AchievementPointsRow[];
	unmappedLabels: UnmappedAchievementLabel[];
};

/**
 * Fans an achievement points row labeled with a ranked list name out to
 * every group rank that list currently feeds, mirroring
 * `planLedgerBackfill`'s fan-out rules exactly: a "Global" or "N/A" label
 * never feeds a group, any other label is alias-resolved before lookup and
 * grouping, and the whole label is reported unmapped — never partially
 * credited — when its resolved name or any fed group rank has no matching
 * rank row.
 */
export function fanOutAchievementPoints(
	rows: AchievementPointsRow[],
	resolveAlias: ResolveAlias,
	groupsFor: GroupsFor,
	ranksByName: RanksByName,
): FanOutAchievementPointsResult {
	const fanned: AchievementPointsRow[] = [];
	const unmappedCounts = new Map<string, number>();

	for (const row of rows) {
		const targetNames = resolveTargetNames(row.rankName, resolveAlias, groupsFor);
		const allResolved = targetNames.every((name) => ranksByName(name) !== undefined);

		if (!allResolved) {
			unmappedCounts.set(row.rankName, (unmappedCounts.get(row.rankName) ?? 0) + 1);
			continue;
		}

		for (const name of targetNames) {
			fanned.push({ userId: row.userId, rankName: name, season: row.season, points: row.points });
		}
	}

	return {
		rows: fanned,
		unmappedLabels: [...unmappedCounts.entries()]
			.map(([label, occurrences]) => ({ label, occurrences }))
			.sort((a, b) => a.label.localeCompare(b.label)),
	};
}

function resolveTargetNames(
	label: string,
	resolveAlias: ResolveAlias,
	groupsFor: GroupsFor,
): string[] {
	if (label === GLOBAL_RANK_NAME || label === NO_BAN_LIST_RANK_NAME) {
		return [label];
	}

	const resolvedName = resolveAlias(label);

	return [resolvedName, ...groupsFor(resolvedName)];
}
