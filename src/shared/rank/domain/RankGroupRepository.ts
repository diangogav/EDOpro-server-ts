export type RankGroupUpsert = {
	name: string;
	enabled: boolean;
	onlyCurrent: boolean;
};

/** Persistence port for seeding configured group ranks at boot. */
export interface RankGroupRepository {
	/**
	 * Upserts a `type: "group"` rank by its unique name, updating enabled and
	 * only_current on an existing group. Returns null when the name belongs
	 * to a rank of another type — those are never touched.
	 */
	upsertGroup(group: RankGroupUpsert): Promise<{ id: string } | null>;

	/** Replaces every rank_members row of the given rank with these patterns. */
	replaceMembers(rankId: string, patterns: string[]): Promise<void>;

	/** Names of every rank with type "group". */
	findGroupNames(): Promise<string[]>;
}
