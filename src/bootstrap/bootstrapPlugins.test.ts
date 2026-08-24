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
});
