import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, DuelEventSubscriptions, PluginDeps } from "@shared/plugin/ServerPlugin";
import { DamageDealtEvent } from "@shared/room/domain/duel-events/DuelEvents";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { expectServerPluginContract } from "@test-support/plugin/expectServerPluginContract";

import plugin, { BIG_DAMAGE_THRESHOLD } from "./index";

const bus = { subscribe: jest.fn() } as unknown as EventBus;

function makeDeps(): {
	deps: PluginDeps;
	handlers: Map<string, (event: DamageDealtEvent) => void | Promise<void>>;
	logger: LoggerMock;
} {
	const handlers = new Map<string, (event: DamageDealtEvent) => void | Promise<void>>();
	const logger = new LoggerMock();
	const duelEvents: DuelEventSubscriptions = {
		subscribe: (kind, handler) => {
			handlers.set(kind, handler as (event: DamageDealtEvent) => void | Promise<void>);
		},
	};

	return { deps: { logger, config: {} as AppConfig, duelEvents }, handlers, logger };
}

const damage = (amount: number): DamageDealtEvent => ({ roomId: 7, team: 1, amount, turn: 3 });

describe("big-damage-log plugin", () => {
	it("conforms to the ServerPlugin contract", () => {
		expectServerPluginContract(plugin);
	});

	it("is always enabled", () => {
		expect(plugin.enabled({} as AppConfig)).toBe(true);
	});

	it("declares exactly duel.damage", () => {
		expect(plugin.duelEvents).toEqual(["duel.damage"]);
	});

	it("logs a damage event at or above the threshold", () => {
		const { deps, handlers, logger } = makeDeps();
		const infoSpy = jest.spyOn(logger, "info");
		plugin.register(bus, deps);

		handlers.get("duel.damage")?.(damage(BIG_DAMAGE_THRESHOLD));

		expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining("5000"));
	});

	it("stays silent below the threshold", () => {
		const { deps, handlers, logger } = makeDeps();
		const infoSpy = jest.spyOn(logger, "info");
		plugin.register(bus, deps);

		handlers.get("duel.damage")?.(damage(BIG_DAMAGE_THRESHOLD - 1));

		expect(infoSpy).not.toHaveBeenCalled();
	});

	it("never touches the event bus", () => {
		const { deps } = makeDeps();
		plugin.register(bus, deps);

		expect(bus.subscribe).not.toHaveBeenCalled();
	});
});
