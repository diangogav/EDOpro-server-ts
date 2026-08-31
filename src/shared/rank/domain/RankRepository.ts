import { Rank, RankType } from "./Rank";

export interface RankRepository {
	/**
	 * Looks a rank up by its unique name, creating it when missing. Safe
	 * under concurrency: two callers racing on the same missing name must
	 * both end up with the same persisted rank row.
	 *
	 * A rank created on the fly is `type: "banlist"` and enabled, except the
	 * literal name "Global", which is `type: "global"`. An explicit `type`
	 * argument overrides that default.
	 */
	findOrCreateByName(name: string, type?: RankType): Promise<Rank>;
}
