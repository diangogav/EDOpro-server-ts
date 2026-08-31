import { EventBus } from "@shared/event-bus/EventBus";
import { PluginDeps, ServerPlugin } from "@shared/plugin/ServerPlugin";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { InMemoryLoadedBanListNamesProvider } from "@shared/rank/infrastructure/InMemoryLoadedBanListNamesProvider";
import { RankPostgresRepository } from "@shared/rank/infrastructure/RankPostgresRepository";
import { getActiveRankGroupsConfig } from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import { RatingPostgresRepository } from "@shared/stats/rating/infrastructure/RatingPostgresRepository";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { EloRatingCalculator } from "./application/EloRatingCalculator";

// Ranking-gated: with config.ranking.enabled === false this plugin never
// registers, so no Postgres query is issued on GAME_OVER (see spec
// "Ranking-gated persistence plugins").
const plugin: ServerPlugin = {
	name: "elo-rating",
	enabled: (config) => config.ranking.enabled,
	register: (bus: EventBus, deps: PluginDeps) => {
		bus.subscribe(
			EloRatingCalculator.ListenTo,
			new EloRatingCalculator(
				deps.logger,
				new UserProfilePostgresRepository(),
				new RatingPostgresRepository(),
				new RankPostgresRepository(),
				new RankGroupResolver(getActiveRankGroupsConfig, new InMemoryLoadedBanListNamesProvider()),
			),
		);
	},
};

export default plugin;
