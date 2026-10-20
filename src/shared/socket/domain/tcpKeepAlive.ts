import { readFileSync } from "fs";

import { Logger } from "@shared/logger/domain/Logger";

/**
 * Node only exposes the idle delay before the first keepalive probe. The probe
 * interval and count come from the kernel (net.ipv4.tcp_keepalive_intvl and
 * tcp_keepalive_probes), whose defaults take about eleven minutes to give up
 * on a peer that vanished without a FIN.
 *
 * Probes are answered by the peer's kernel, so a client that is merely idle
 * (thinking, side decking, waiting on the opponent) is never dropped by them.
 */
export const TCP_KEEPALIVE_INITIAL_DELAY_MS = 1000;

/** How long a dead TCP peer may go unnoticed before the deployment is flagged. */
export const DEAD_PEER_BUDGET_SECONDS = 60;

const INTERVAL_PATH = "/proc/sys/net/ipv4/tcp_keepalive_intvl";
const PROBES_PATH = "/proc/sys/net/ipv4/tcp_keepalive_probes";

export function estimateDeadPeerDetectionSeconds({
	idleSeconds,
	intervalSeconds,
	probes,
}: {
	idleSeconds: number;
	intervalSeconds: number;
	probes: number;
}): number {
	return idleSeconds + intervalSeconds * probes;
}

/**
 * Warn when the kernel keepalive tuning leaves dead TCP peers undetected for
 * longer than the budget. Returns the estimate, or undefined where the settings
 * cannot be read (non-Linux hosts, restricted /proc).
 */
export function checkTcpKeepAliveTuning(
	logger: Logger,
	readSetting: (path: string) => string = (path) => readFileSync(path, "utf8"),
): number | undefined {
	let intervalSeconds: number;
	let probes: number;
	try {
		intervalSeconds = Number(readSetting(INTERVAL_PATH).trim());
		probes = Number(readSetting(PROBES_PATH).trim());
	} catch {
		return undefined;
	}
	if (!Number.isFinite(intervalSeconds) || !Number.isFinite(probes)) {
		return undefined;
	}

	const detectionSeconds = estimateDeadPeerDetectionSeconds({
		idleSeconds: TCP_KEEPALIVE_INITIAL_DELAY_MS / 1000,
		intervalSeconds,
		probes,
	});
	if (detectionSeconds > DEAD_PEER_BUDGET_SECONDS) {
		logger.warn(
			"Kernel tcp_keepalive settings leave dead TCP peers undetected for a long time; lower net.ipv4.tcp_keepalive_intvl and tcp_keepalive_probes (see docker-compose.prod.yaml)",
			{ detectionSeconds, budgetSeconds: DEAD_PEER_BUDGET_SECONDS, intervalSeconds, probes },
		);
	}

	return detectionSeconds;
}
