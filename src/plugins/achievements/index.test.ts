import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, PluginDeps } from "@shared/plugin/ServerPlugin";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { expectServerPluginContract } from "@test-support/plugin/expectServerPluginContract";

import { AchievementAwarder } from "./application/AchievementAwarder";
import plugin from "./index";

function makeConfig(rankingEnabled: boolean): AppConfig {
	return { ranking: { enabled: rankingEnabled } } as unknown as AppConfig;
}

function makeDeps(): PluginDeps {
	return { logger: new LoggerMock(), config: makeConfig(true) };
}

describe("achievements plugin", () => {
	it("conforms to the ServerPlugin contract", () => {
		expectServerPluginContract(plugin);
	});

	it("is disabled when ranking is disabled", () => {
		expect(plugin.enabled(makeConfig(false))).toBe(false);
	});

	it("is enabled when ranking is enabled", () => {
		expect(plugin.enabled(makeConfig(true))).toBe(true);
	});

	it("declares exactly one lifecycle hook, the awarder", () => {
		expect(plugin.lifecycleHooks).toHaveLength(1);
		expect(plugin.lifecycleHooks?.[0]).toBeInstanceOf(AchievementAwarder);
	});

	it("subscribes to no bus event — delivery happens through lifecycleHooks", () => {
		const bus = { subscribe: jest.fn() } as unknown as EventBus;

		plugin.register(bus, makeDeps());

		expect(bus.subscribe).not.toHaveBeenCalled();
	});

	it("publishes unlock events on the bus handed to register", async () => {
		const bus = { subscribe: jest.fn(), publish: jest.fn().mockResolvedValue(undefined) };
		plugin.register(bus as unknown as EventBus, makeDeps());
		const awarder = plugin.lifecycleHooks?.[0] as unknown as {
			unlockedPublisher: { publish: (name: string, event: unknown) => Promise<void> };
		};

		await awarder.unlockedPublisher.publish("X", { a: 1 });

		expect(bus.publish).toHaveBeenCalledWith("X", { a: 1 });
	});
});
