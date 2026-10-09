import { EventBus } from "@shared/event-bus/EventBus";
import { PluginDeps, ServerPlugin } from "@shared/plugin/ServerPlugin";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { getActiveRankGroupsConfig } from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import { InMemoryLoadedBanListNamesProvider } from "@shared/rank/infrastructure/InMemoryLoadedBanListNamesProvider";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { AchievementAwarder } from "./application/AchievementAwarder";
import { AchievementCatalogPostgresRepository } from "./infrastructure/postgres/AchievementCatalogPostgresRepository";
import { MatchHistoryPostgresReader } from "./infrastructure/postgres/MatchHistoryPostgresReader";
import { UserAchievementPostgresRepository } from "./infrastructure/postgres/UserAchievementPostgresRepository";

// Ranking-gated: achievements are computed from persisted ranked matches, so
// with config.ranking.enabled === false the plugin never registers.
const plugin: ServerPlugin = {
	name: "achievements",
	enabled: (config) => config.ranking.enabled,
	register: (bus: EventBus, deps: PluginDeps) => {
		bus.subscribe(
			AchievementAwarder.ListenTo,
			new AchievementAwarder(
				deps.logger,
				new UserProfilePostgresRepository(),
				new MatchHistoryPostgresReader(),
				new AchievementCatalogPostgresRepository(),
				new UserAchievementPostgresRepository(),
				new RankGroupResolver(getActiveRankGroupsConfig, new InMemoryLoadedBanListNamesProvider()),
			),
		);
	},
};

export default plugin;
