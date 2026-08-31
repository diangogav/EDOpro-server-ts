import { Rank, RankType } from "./Rank";

export interface RankRepository {
	/**
	 * Looks a rank up by its unique name, creating it when missing. Safe
	 * under concurrency: two callers racing on the same missing name must
	 * both end up with the same persisted rank row.
	 *
	 * A rank created on the fly is `type: "banlist"` and enabled, except the
	 * literal name "Global", which is `type: "global"`, and the literal name
	 * "N/A", which is created disabled because it is not a ladder players can
	 * browse. An explicit `type` argument overrides the type default. An
	 * already-existing row keeps its stored flags.
	 */
	findOrCreateByName(name: string, type?: RankType): Promise<Rank>;
}
