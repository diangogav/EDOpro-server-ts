import { AddressInfo, createServer } from "net";

import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";
import { DuelResourceMonitorHolder } from "@shared/metrics/domain/DuelResourceMonitorHolder";
import { noopDuelResourceMonitor } from "@shared/metrics/domain/DuelResourceMonitor";
import { MetricsServer } from "@shared/metrics/infrastructure/MetricsServer";

import { bootstrapMetrics } from "./bootstrapMetrics";

async function freePort(): Promise<number> {
	const probe = createServer();
	await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
	const { port } = probe.address() as AddressInfo;
	await new Promise((resolve) => probe.close(resolve));

	return port;
}

describe("bootstrapMetrics", () => {
	let server: MetricsServer | null = null;

	afterEach(async () => {
		await server?.stop();
		server = null;
		DuelResourceMonitorHolder.reset();
	});

	it("opens no endpoint and keeps the no-op monitor when disabled", async () => {
		server = await bootstrapMetrics(
			{ enabled: false, host: "127.0.0.1", port: 0, sampleIntervalMs: 2000 },
			new LoggerMock(),
		);

		expect(server).toBeNull();
		expect(DuelResourceMonitorHolder.get()).toBe(noopDuelResourceMonitor);
	});

	it("serves process and duel metrics and installs the monitor when enabled", async () => {
		const port = await freePort();
		server = await bootstrapMetrics(
			{ enabled: true, host: "127.0.0.1", port, sampleIntervalMs: 2000 },
			new LoggerMock(),
		);

		const body = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();

		expect(DuelResourceMonitorHolder.get()).not.toBe(noopDuelResourceMonitor);
		expect(body).toContain("process_cpu_seconds_total");
		expect(body).toContain("nodejs_eventloop_lag_seconds");
		expect(body).toContain('evolution_duels_active{flow="ygopro"} 0');
	});

	it("keeps starting when the metrics port is taken", async () => {
		const port = await freePort();
		const blocker = createServer();
		await new Promise<void>((resolve) => blocker.listen(port, "127.0.0.1", resolve));

		server = await bootstrapMetrics(
			{ enabled: true, host: "127.0.0.1", port, sampleIntervalMs: 2000 },
			new LoggerMock(),
		);

		expect(server).toBeNull();
		await new Promise((resolve) => blocker.close(resolve));
	});
});
