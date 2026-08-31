import { EventBus } from "@shared/event-bus/EventBus";
import { PluginDeps, ServerPlugin } from "@shared/plugin/ServerPlugin";
import { MatchResumeCreator } from "@shared/stats/match-resume/application/MatchResumeCreator";
import { DuelResumeCreator } from "@shared/stats/match-resume/duel-resume/application/DuelResumeCreator";
import { MatchResumePostgresRepository } from "@shared/stats/match-resume/infrastructure/postgres/MatchResumePostgresRepository";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { InMemoryLoadedBanListNamesProvider } from "@shared/rank/infrastructure/InMemoryLoadedBanListNamesProvider";
import { RankPostgresRepository } from "@shared/rank/infrastructure/RankPostgresRepository";
import { getActiveRankGroupsConfig } from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import { PlayerStatsPostgresRepository } from "@shared/stats/player-stats/infrastructure/PlayerStatsPostgresRepository";
import { UserProfilePostgresRepository } from "@shared/user-profile/infrastructure/postgres/UserProfilePostgresRepository";

import { BasicStatsCalculator } from "./application/BasicStatsCalculator";

// Ranking-gated: with config.ranking.enabled === false this plugin never
// registers, so no Postgres query is issued on GAME_OVER (see spec
// "Ranking-gated persistence plugins").
const plugin: ServerPlugin = {
	name: "basic-stats",
	enabled: (config) => config.ranking.enabled,
	register: (bus: EventBus, deps: PluginDeps) => {
		bus.subscribe(
			BasicStatsCalculator.ListenTo,
			new BasicStatsCalculator(
				deps.logger,
				new UserProfilePostgresRepository(),
				new PlayerStatsPostgresRepository(),
				new RankPostgresRepository(),
				new RankGroupResolver(getActiveRankGroupsConfig, new InMemoryLoadedBanListNamesProvider()),
				new MatchResumeCreator(new MatchResumePostgresRepository()),
				new DuelResumeCreator(new MatchResumePostgresRepository()),
			),
		);
	},
};

export default plugin;
