import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, PluginDeps } from "@shared/plugin/ServerPlugin";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { expectServerPluginContract } from "@test-support/plugin/expectServerPluginContract";

import plugin from "./index";

function makeConfig(rankingEnabled: boolean): AppConfig {
	return { ranking: { enabled: rankingEnabled } } as unknown as AppConfig;
}

function makeDeps(): PluginDeps {
	return { logger: new LoggerMock(), config: makeConfig(true) };
}

describe("basic-stats plugin", () => {
	it("conforms to the ServerPlugin contract", () => {
		expectServerPluginContract(plugin);
	});

	it("is disabled when ranking is disabled", () => {
		expect(plugin.enabled(makeConfig(false))).toBe(false);
	});

	it("is enabled when ranking is enabled", () => {
		expect(plugin.enabled(makeConfig(true))).toBe(true);
	});

	it("subscribes to GAME_OVER on register", () => {
		const bus = { subscribe: jest.fn() } as unknown as EventBus;

		plugin.register(bus, makeDeps());

		expect(bus.subscribe).toHaveBeenCalledTimes(1);
		expect(bus.subscribe).toHaveBeenCalledWith(GameOverDomainEvent.DOMAIN_EVENT, expect.anything());
	});
});
