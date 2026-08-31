import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
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
			LoggerFactory.getLogger({ file: "RatingAnnouncer" }),
		),
	],
	register: () => {
		// No bus subscription — see the module comment above.
	},
};

export default plugin;
