import { Registry } from "@prometheus-io/client";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { DuelResourceContext } from "../domain/DuelResourceMonitor";
import { DuelMetrics } from "./DuelMetrics";
import { ProcessResources } from "./ProcResourceReader";
import { SampledDuelResourceMonitor } from "./SampledDuelResourceMonitor";

function makeContext(overrides?: Partial<DuelResourceContext>): DuelResourceContext {
	return { flow: "edopro", roomId: 12, matchId: "match-1", ranked: true, ...overrides };
}

function makeReader(samples: Array<ProcessResources | null>): { read: jest.Mock } {
	return { read: jest.fn(async () => (samples.length > 1 ? samples.shift() : samples[0]) ?? null) };
}

async function metricValue(
	registry: Registry,
	name: string,
	labels: Record<string, string>,
): Promise<number | undefined> {
	// Histogram series (_sum, _count) live inside the base metric as metricName.
	const baseName = name.replace(/_(sum|count)$/, "");
	const metric = (await registry.getMetricsAsJSON()).find((m) => m.name === baseName);
	const value = metric?.values.find(
		(v) =>
			((v as { metricName?: string }).metricName ?? metric.name) === name &&
			Object.entries(labels).every(([key, expected]) => String(v.labels[key]) === expected),
	);

	return value?.value;
}

async function flushPromises(): Promise<void> {
	for (let i = 0; i < 5; i += 1) {
		await Promise.resolve();
	}
}

describe("SampledDuelResourceMonitor", () => {
	let registry: Registry;
	let logger: LoggerMock;
	let now: number;

	beforeEach(() => {
		jest.useFakeTimers();
		registry = new Registry();
		logger = new LoggerMock();
		jest.spyOn(logger, "info");
		now = 1_000;
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	function makeMonitor(reader: { read: jest.Mock }): SampledDuelResourceMonitor {
		return new SampledDuelResourceMonitor({
			metrics: new DuelMetrics(registry),
			reader,
			logger,
			sampleIntervalMs: 2_000,
			now: () => now,
		});
	}

	it("logs and observes the last process sample when the process ends", async () => {
		const reader = makeReader([
			{ cpuSeconds: 1, peakMemoryBytes: 10 },
			{ cpuSeconds: 2.5, peakMemoryBytes: 40 },
			null,
		]);
		const monitor = makeMonitor(reader);

		const watch = monitor.watchProcess(42, makeContext());
		expect(await metricValue(registry, "evolution_duels_active", { flow: "edopro" })).toBe(1);

		await jest.advanceTimersByTimeAsync(4_000);
		now = 6_000;
		watch.end();
		await flushPromises();

		expect(logger.info).toHaveBeenCalledWith("duel.resources", {
			flow: "edopro",
			roomId: 12,
			matchId: "match-1",
			ranked: true,
			durationMs: 5_000,
			cpuSeconds: 2.5,
			peakMemoryBytes: 40,
		});
		expect(await metricValue(registry, "evolution_duels_active", { flow: "edopro" })).toBe(0);
		expect(
			await metricValue(registry, "evolution_duel_cpu_seconds_sum", {
				flow: "edopro",
				ranked: "true",
			}),
		).toBe(2.5);
		expect(
			await metricValue(registry, "evolution_duel_peak_memory_bytes_sum", {
				flow: "edopro",
				ranked: "true",
			}),
		).toBe(40);
		expect(
			await metricValue(registry, "evolution_duel_duration_seconds_sum", {
				flow: "edopro",
				ranked: "true",
			}),
		).toBe(5);
	});

	it("stops sampling and records once when end is called twice", async () => {
		const reader = makeReader([{ cpuSeconds: 1, peakMemoryBytes: 10 }]);
		const monitor = makeMonitor(reader);

		const watch = monitor.watchProcess(42, makeContext());
		watch.end();
		watch.end();
		await flushPromises();
		const readsAfterEnd = reader.read.mock.calls.length;
		await jest.advanceTimersByTimeAsync(10_000);

		expect(reader.read.mock.calls.length).toBe(readsAfterEnd);
		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(await metricValue(registry, "evolution_duels_active", { flow: "edopro" })).toBe(0);
	});

	it("records only the duration when a process without pid ends", async () => {
		const reader = makeReader([null]);
		const monitor = makeMonitor(reader);

		const watch = monitor.watchProcess(undefined, makeContext());
		now = 3_000;
		watch.end();
		await flushPromises();

		expect(reader.read).not.toHaveBeenCalled();
		expect(logger.info).toHaveBeenCalledWith(
			"duel.resources",
			expect.objectContaining({ durationMs: 2_000, cpuSeconds: null, peakMemoryBytes: null }),
		);
		expect(
			await metricValue(registry, "evolution_duel_cpu_seconds_count", {
				flow: "edopro",
				ranked: "true",
			}),
		).toBeUndefined();
	});

	it("records the stats a thread duel reports when it ends", async () => {
		const monitor = makeMonitor(makeReader([null]));

		const watch = monitor.watchThread(makeContext({ flow: "ygopro", ranked: false }));
		expect(await metricValue(registry, "evolution_duels_active", { flow: "ygopro" })).toBe(1);
		now = 2_000;
		watch.end({ cpuSeconds: 0.75, memoryBytes: 64 });
		await flushPromises();

		expect(logger.info).toHaveBeenCalledWith(
			"duel.resources",
			expect.objectContaining({
				flow: "ygopro",
				durationMs: 1_000,
				cpuSeconds: 0.75,
				peakMemoryBytes: 64,
			}),
		);
		expect(await metricValue(registry, "evolution_duels_active", { flow: "ygopro" })).toBe(0);
		expect(
			await metricValue(registry, "evolution_duel_cpu_seconds_sum", {
				flow: "ygopro",
				ranked: "false",
			}),
		).toBe(0.75);
	});
});
