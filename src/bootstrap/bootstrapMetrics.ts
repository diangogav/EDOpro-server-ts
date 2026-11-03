import { collectDefaultMetrics, Registry } from "@prometheus-io/client";

import { Logger } from "@shared/logger/domain/Logger";
import { DuelResourceMonitorHolder } from "@shared/metrics/domain/DuelResourceMonitorHolder";
import { DuelMetrics } from "@shared/metrics/infrastructure/DuelMetrics";
import { MetricsServer } from "@shared/metrics/infrastructure/MetricsServer";
import { ProcLivenessReader } from "@shared/metrics/infrastructure/ProcLivenessReader";
import { ProcessLivenessMetrics } from "@shared/metrics/infrastructure/ProcessLivenessMetrics";
import { ProcResourceReader } from "@shared/metrics/infrastructure/ProcResourceReader";
import { SampledDuelResourceMonitor } from "@shared/metrics/infrastructure/SampledDuelResourceMonitor";

export type MetricsOptions = {
	enabled: boolean;
	host: string;
	port: number;
	sampleIntervalMs: number;
};

/**
 * Installs the duel resource monitor and starts the `/metrics` endpoint.
 * Disabled, it leaves the no-op monitor in place and opens no port.
 */
export async function bootstrapMetrics(
	options: MetricsOptions,
	logger: Logger,
): Promise<MetricsServer | null> {
	if (!options.enabled) {
		return null;
	}

	const registry = new Registry();
	collectDefaultMetrics({ register: registry });
	new ProcessLivenessMetrics(registry, new ProcLivenessReader());

	const metricsLogger = logger.child({ file: "metrics" });
	DuelResourceMonitorHolder.set(
		new SampledDuelResourceMonitor({
			metrics: new DuelMetrics(registry),
			reader: new ProcResourceReader(),
			logger: metricsLogger,
			sampleIntervalMs: options.sampleIntervalMs,
		}),
	);

	const server = new MetricsServer(registry, options.host, options.port);
	try {
		await server.start();
		metricsLogger.info("Metrics endpoint listening", { host: options.host, port: options.port });
	} catch (error) {
		// A metrics port problem must never keep the game server from starting.
		metricsLogger.error(error as Error, { host: options.host, port: options.port });

		return null;
	}

	return server;
}
