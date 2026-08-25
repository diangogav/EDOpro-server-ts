import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, PluginDeps } from "@shared/plugin/ServerPlugin";
import { GameOverDomainEvent } from "@shared/room/domain/match/domain/domain-events/GameOverDomainEvent";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { dataSource } from "src/evolution-types/src/data-source";

import { DuelEventPluginHub } from "@shared/room/domain/duel-events/DuelEventPluginHub";

import { bootstrapPlugins } from "./bootstrapPlugins";

// Exercises bootstrapPlugins against the real src/plugins directory (no
// injected pluginsRoot), the discovery target it uses in production. This
// proves the ranking gate (spec: "Ranking-gated persistence plugins") and
// the composition-root wiring (task 4.4) end to end, on top of the
// fixture-driven unit coverage in bootstrapPlugins.test.ts.
function makeConfig(rankingEnabled: boolean): AppConfig {
	return { ranking: { enabled: rankingEnabled } } as unknown as AppConfig;
}

function makeDeps(rankingEnabled: boolean): PluginDeps {
	return { logger: new LoggerMock(), config: makeConfig(rankingEnabled) };
}

describe("bootstrapPlugins against the real src/plugins directory", () => {
	beforeEach(() => {
		DuelEventPluginHub.resetInstance();
	});

	afterEach(() => {
		DuelEventPluginHub.resetInstance();
	});

	it("skips both stats plugins when ranking is disabled (zero-argument default pluginsRoot)", async () => {
		const bus = { subscribe: jest.fn() } as unknown as EventBus;

		const report = await bootstrapPlugins(bus, makeDeps(false));

		// big-damage-log is ranking-independent and observes duel events only,
		// so it loads without ever touching the event bus.
		expect(report.loaded).toEqual(["big-damage-log"]);
		expect(report.skipped).toEqual(expect.arrayContaining(["basic-stats", "unranked-match"]));
		expect(bus.subscribe).not.toHaveBeenCalled();
	});

	it("registers both stats plugins when ranking is enabled (zero-argument default pluginsRoot)", async () => {
		const bus = { subscribe: jest.fn() } as unknown as EventBus;

		const report = await bootstrapPlugins(bus, makeDeps(true));

		expect(report.loaded).toEqual(
			expect.arrayContaining(["basic-stats", "big-damage-log", "unranked-match"]),
		);
		expect(bus.subscribe).toHaveBeenCalledTimes(2);
	});

	it("issues zero Postgres queries when ranking is disabled and GAME_OVER is published", async () => {
		const bus = new EventBus(new LoggerMock());
		const getRepositorySpy = jest.spyOn(dataSource, "getRepository").mockImplementation();

		await bootstrapPlugins(bus, makeDeps(false));

		await bus.publish(
			GameOverDomainEvent.DOMAIN_EVENT,
			new GameOverDomainEvent({
				roomId: 7,
				matchId: "match-uuid-1",
				duelIds: ["duel-uuid-1"],
				ranked: false,
				players: [],
				bestOf: 1,
				date: new Date(),
				banListHash: 0,
				banListName: "N/A",
			}),
		);

		expect(getRepositorySpy).not.toHaveBeenCalled();

		getRepositorySpy.mockRestore();
	});
});
