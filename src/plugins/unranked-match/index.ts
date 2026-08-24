import { EventBus } from "@shared/event-bus/EventBus";
import { PluginDeps, ServerPlugin } from "@shared/plugin/ServerPlugin";

import { UnrankedMatchSaver } from "./application/UnrankedMatchSaver";
import { UnrankedMatchPostgresRepository } from "./infrastructure/postgres/UnrankedMatchPostgresRepository";

// Ranking-gated: with config.ranking.enabled === false this plugin never
// registers, so no Postgres query is issued on GAME_OVER (see spec
// "Ranking-gated persistence plugins"). This intentionally stops the
// unranked-match writes that previously ran unconditionally against a
// never-connected Postgres dataSource whenever ranking was disabled.
const plugin: ServerPlugin = {
	name: "unranked-match",
	enabled: (config) => config.ranking.enabled,
	register: (bus: EventBus, deps: PluginDeps) => {
		bus.subscribe(
			UnrankedMatchSaver.ListenTo,
			new UnrankedMatchSaver(deps.logger, new UnrankedMatchPostgresRepository()),
		);
	},
};

export default plugin;
