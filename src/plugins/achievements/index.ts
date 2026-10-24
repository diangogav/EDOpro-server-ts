import { EventBus } from "@shared/event-bus/EventBus";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { ServerPlugin } from "@shared/plugin/ServerPlugin";
import { RankGroupResolver } from "@shared/rank/application/RankGroupResolver";
import { getActiveRankGroupsConfig } from "@shared/rank/infrastructure/RankGroupsConfigLoader";
import { createLoadedBanListNamesProvider } from "src/bootstrap/loadedBanListNamesProvider";

import { AchievementUnlockedDomainEvent } from "./domain/AchievementUnlockedDomainEvent";
import { AchievementUnlockedPublisher } from "./domain/AchievementUnlockedPublisher";
import { AchievementAwarder } from "./application/AchievementAwarder";
import { AchievementCatalogPostgresRepository } from "./infrastructure/postgres/AchievementCatalogPostgresRepository";
import { MatchHistoryPostgresReader } from "./infrastructure/postgres/MatchHistoryPostgresReader";
import { UserAchievementPostgresRepository } from "./infrastructure/postgres/UserAchievementPostgresRepository";

// The lifecycle hook is built at module load, before the bus exists; unlock
// events go through this forwarder, which register() points at the real bus.
// A match cannot end before plugins are registered.
let bus: EventBus | undefined;
const unlockedPublisher: AchievementUnlockedPublisher = {
	publish: async (eventName: string, event: AchievementUnlockedDomainEvent) => {
		await bus?.publish(eventName, event);
	},
};

// Ranking-gated: achievements are computed from persisted ranked matches, so
// with config.ranking.enabled === false the plugin never registers. Delivery
// happens through lifecycleHooks (the unlock is announced before the duel
// sockets close) — register() subscribes to no bus event.
const plugin: ServerPlugin = {
	name: "achievements",
	enabled: (config) => config.ranking.enabled,
	lifecycleHooks: [
		new AchievementAwarder(
			LoggerFactory.getLogger({ file: "AchievementAwarder" }),
			new MatchHistoryPostgresReader(),
			new AchievementCatalogPostgresRepository(),
			new UserAchievementPostgresRepository(),
			new RankGroupResolver(getActiveRankGroupsConfig, createLoadedBanListNamesProvider()),
			unlockedPublisher,
		),
	],
	register: (eventBus: EventBus) => {
		bus = eventBus;
	},
};

export default plugin;
