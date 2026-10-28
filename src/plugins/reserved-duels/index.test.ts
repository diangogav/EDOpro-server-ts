import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, PluginDeps } from "@shared/plugin/ServerPlugin";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { expectServerPluginContract } from "@test-support/plugin/expectServerPluginContract";

import plugin from "./index";

const makeConfig = (rankingEnabled: boolean): AppConfig =>
	({ ranking: { enabled: rankingEnabled } }) as unknown as AppConfig;

const makeDeps = (): PluginDeps => ({ logger: new LoggerMock(), config: makeConfig(true) });

describe("reserved-duels plugin", () => {
	it("conforms to the ServerPlugin contract", () => {
		expectServerPluginContract(plugin);
	});

	it("is enabled only with Postgres (ranking on)", () => {
		expect(plugin.enabled(makeConfig(true))).toBe(true);
		expect(plugin.enabled(makeConfig(false))).toBe(false);
	});

	it("subscribes to GAME_OVER on register", () => {
		const bus = { subscribe: jest.fn() } as unknown as EventBus;

		plugin.register(bus, makeDeps());

		expect(bus.subscribe).toHaveBeenCalledWith(GameOverDomainEvent.DOMAIN_EVENT, expect.anything());
	});
});
