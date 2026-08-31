import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { EventBus } from "@shared/event-bus/EventBus";
import { AppConfig, PluginDeps } from "@shared/plugin/ServerPlugin";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import {
	resetRegistrationOrder,
	registrationOrder,
} from "@test-support/plugin-fixtures/alphabetical-order/order";
import {
	resetRegisterCalls,
	registerCalls,
} from "@test-support/plugin-fixtures/kitchen-sink/valid-plugin/capture";

import { DuelEventDispatcher } from "@shared/room/domain/duel-events/DuelEventDispatcher";
import { DuelEventPluginHub } from "@shared/room/domain/duel-events/DuelEventPluginHub";
import { YgoRoom } from "@shared/room/domain/YgoRoom";
import {
	receivedEvents,
	resetReceivedEvents,
} from "@test-support/plugin-fixtures/duel-events/subscriber/capture";
import {
	resetStartedCalls,
	startedCalls,
} from "@test-support/plugin-fixtures/lifecycle-hooks/provider/capture";

import { container } from "@shared/dependency-injection";
import { MatchLifecycleHooks } from "@shared/room/application/lifecycle/MatchLifecycleHooks";

import { bootstrapPlugins } from "./bootstrapPlugins";

const FIXTURES_ROOT = path.join(__dirname, "..", "test-support", "plugin-fixtures");

function makeDeps(): PluginDeps {
	return {
		logger: new LoggerMock(),
		config: {} as AppConfig,
	};
}

describe("bootstrapPlugins", () => {
	let bus: EventBus;
	let deps: PluginDeps;

	beforeEach(() => {
		bus = { subscribe: jest.fn() } as unknown as EventBus;
		deps = makeDeps();
		resetRegisterCalls();
		resetRegistrationOrder();
	});

	it.each([
		[
			"a missing directory (ENOENT)",
			() => path.join(os.tmpdir(), `plugin-bootstrap-missing-${Date.now()}`),
		],
		["an empty directory", () => fs.mkdtempSync(path.join(os.tmpdir(), "plugin-bootstrap-empty-"))],
	])("returns an empty report for %s", async (_description, makeRoot) => {
		const report = await bootstrapPlugins(bus, deps, makeRoot());

		expect(report).toEqual({ loaded: [], skipped: [], failed: [] });
	});

	describe("kitchen-sink root", () => {
		const kitchenSinkRoot = path.join(FIXTURES_ROOT, "kitchen-sink");

		it("registers a valid, enabled plugin exactly once with the exact bus and deps", async () => {
			const report = await bootstrapPlugins(bus, deps, kitchenSinkRoot);

			expect(report.loaded).toContain("valid-plugin");
			expect(registerCalls).toHaveLength(1);
			expect(registerCalls[0].bus).toBe(bus);
			expect(registerCalls[0].deps).toBe(deps);
		});

		it("never calls register() for a plugin whose enabled() returns false", async () => {
			const report = await bootstrapPlugins(bus, deps, kitchenSinkRoot);

			expect(report.skipped).toContain("disabled-plugin");
			expect(report.loaded).not.toContain("disabled-plugin");
		});

		it.each([
			["throws-on-import", "failed"],
			["register-throws", "failed"],
			["non-conformant", "skipped"],
		] as const)("isolates a broken %s plugin (bucket: %s) without blocking the valid plugin", async (dirName, bucket) => {
			const report = await bootstrapPlugins(bus, deps, kitchenSinkRoot);

			expect(report[bucket]).toContain(dirName);
			expect(report.loaded).toContain("valid-plugin");
		});
	});

	it("registers plugins in deterministic alphabetical order", async () => {
		const alphabeticalRoot = path.join(FIXTURES_ROOT, "alphabetical-order");

		const report = await bootstrapPlugins(bus, deps, alphabeticalRoot);

		expect(report.loaded).toEqual(["alpha-a", "alpha-b", "alpha-c"]);
		expect(registrationOrder).toEqual(["alpha-a", "alpha-b", "alpha-c"]);
	});

	it("registers only the alphabetically-first plugin when two folders share a name", async () => {
		const duplicateNameRoot = path.join(FIXTURES_ROOT, "duplicate-name");

		const report = await bootstrapPlugins(bus, deps, duplicateNameRoot);

		expect(report.loaded).toEqual(["dup-name"]);
		expect(report.skipped).toContain("duplicate-name-b");
	});

	describe("lifecycle-hooks root", () => {
		const lifecycleHooksRoot = path.join(FIXTURES_ROOT, "lifecycle-hooks");

		beforeEach(() => {
			resetStartedCalls();
		});

		it("registers a plugin-declared lifecycleHooks entry into the shared MatchLifecycleHooks runner", async () => {
			const report = await bootstrapPlugins(bus, deps, lifecycleHooksRoot);
			expect(report.loaded).toContain("lifecycle-provider");
			expect(startedCalls).toEqual([]);

			container.get(MatchLifecycleHooks).runStarted({
				roomId: 1,
				matchId: "match-1",
				ranked: true,
				banListName: "TCG",
				season: 1,
				players: [],
				announce: () => undefined,
			});
			await new Promise((resolve) => setImmediate(resolve));

			expect(startedCalls).toEqual(["started"]);
		});
	});

	describe("duel-events root", () => {
		const duelEventsRoot = path.join(FIXTURES_ROOT, "duel-events");
		const room = { id: 7 } as unknown as YgoRoom;

		beforeEach(() => {
			DuelEventPluginHub.resetInstance();
			resetReceivedEvents();
		});

		afterEach(() => {
			DuelEventPluginHub.resetInstance();
		});

		it("wires a declaring plugin's subscription into the hub", async () => {
			const report = await bootstrapPlugins(bus, deps, duelEventsRoot);
			expect(report.loaded).toContain("subscriber");

			const dispatcher = new DuelEventDispatcher();
			DuelEventPluginHub.getInstance().attach(dispatcher);
			dispatcher.dispatch(
				"duel.damage",
				{ roomId: 7, duelId: "d-1", team: 0, amount: 1000, turn: 1 },
				room,
			);
			await new Promise((resolve) => setImmediate(resolve));

			expect(receivedEvents).toEqual([
				{ roomId: 7, duelId: "d-1", team: 0, amount: 1000, turn: 1 },
			]);
		});

		it("fails a plugin that subscribes to a kind it did not declare", async () => {
			const report = await bootstrapPlugins(bus, deps, duelEventsRoot);

			expect(report.failed).toContain("undeclared-kind");
			expect(report.loaded).not.toContain("undeclared-kind");
		});

		it("keeps deps identity for plugins that declare nothing", async () => {
			const kitchenSinkRoot = path.join(FIXTURES_ROOT, "kitchen-sink");
			await bootstrapPlugins(bus, deps, kitchenSinkRoot);

			expect(registerCalls[0].deps).toBe(deps);
		});
	});
});
