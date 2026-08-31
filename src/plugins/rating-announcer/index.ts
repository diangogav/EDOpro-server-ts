import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { InMemoryLoadedBanListNamesProvider } from "@shared/rank/infrastructure/InMemoryLoadedBanListNamesProvider";
import { RankPostgresRepository } from "@shared/rank/infrastructure/RankPostgresRepository";
import { getActiveRankGroupsConfig } from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import { ServerPlugin } from "@shared/plugin/ServerPlugin";
import { RatingAnnouncer } from "@shared/stats/rating/application/RatingAnnouncer";
import { RatingPostgresRepository } from "@shared/stats/rating/infrastructure/RatingPostgresRepository";

// Ranking-gated, same as the elo-rating plugin: with config.ranking.enabled
// === false this plugin never registers, so RatingAnnouncer's hook never
// joins the MatchLifecycleHooks runner and issues zero Postgres queries.
// Delivery happens entirely through lifecycleHooks — register() subscribes
// to no bus event.
const plugin: ServerPlugin = {
	name: "rating-announcer",
	enabled: (config) => config.ranking.enabled,
	lifecycleHooks: [
		new RatingAnnouncer(
			new RatingPostgresRepository(),
			new RankPostgresRepository(),
			new RankGroupResolver(getActiveRankGroupsConfig, new InMemoryLoadedBanListNamesProvider()),
			LoggerFactory.getLogger({ file: "RatingAnnouncer" }),
		),
	],
	register: () => {
		// No bus subscription — see the module comment above.
	},
};

export default plugin;
