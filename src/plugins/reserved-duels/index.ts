import { EventBus } from "@shared/event-bus/EventBus";
import { PluginDeps, ServerPlugin } from "@shared/plugin/ServerPlugin";
import { ReservedDuelPostgresRepository } from "@shared/reserved-duel/infrastructure/postgres/ReservedDuelPostgresRepository";

import { ReservedDuelResultRecorder } from "./application/ReservedDuelResultRecorder";

// Reserved duels are recorded in Postgres, which the server only connects to
// when ranking is enabled; without it no reserved room can open either.
const plugin: ServerPlugin = {
	name: "reserved-duels",
	enabled: (config) => config.ranking.enabled,
	register: (bus: EventBus, deps: PluginDeps) => {
		bus.subscribe(
			ReservedDuelResultRecorder.ListenTo,
			new ReservedDuelResultRecorder(deps.logger, new ReservedDuelPostgresRepository()),
		);
	},
};

export default plugin;
