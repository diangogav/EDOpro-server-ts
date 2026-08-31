import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, PluginDeps } from "@shared/plugin/ServerPlugin";
import { RatingAnnouncer } from "@shared/stats/rating/application/RatingAnnouncer";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { expectServerPluginContract } from "@test-support/plugin/expectServerPluginContract";

import plugin from "./index";

function makeConfig(rankingEnabled: boolean): AppConfig {
	return { ranking: { enabled: rankingEnabled } } as unknown as AppConfig;
}

function makeDeps(): PluginDeps {
	return { logger: new LoggerMock(), config: makeConfig(true) };
}

describe("rating-announcer plugin", () => {
	it("conforms to the ServerPlugin contract", () => {
		expectServerPluginContract(plugin);
	});

	it("is disabled when ranking is disabled", () => {
		expect(plugin.enabled(makeConfig(false))).toBe(false);
	});

	it("is enabled when ranking is enabled", () => {
		expect(plugin.enabled(makeConfig(true))).toBe(true);
	});

	it("declares exactly one lifecycle hook — a RatingAnnouncer instance", () => {
		expect(plugin.lifecycleHooks).toHaveLength(1);
		expect(plugin.lifecycleHooks?.[0]).toBeInstanceOf(RatingAnnouncer);
	});

	it("subscribes to no bus event — delivery happens through lifecycleHooks", () => {
		const bus = { subscribe: jest.fn() } as unknown as EventBus;

		plugin.register(bus, makeDeps());

		expect(bus.subscribe).not.toHaveBeenCalled();
	});
});
