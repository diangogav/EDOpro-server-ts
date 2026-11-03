import { Logger } from "@shared/logger/domain/Logger";

import {
	DEAD_PEER_BUDGET_SECONDS,
	TCP_KEEPALIVE_INITIAL_DELAY_MS,
	checkTcpKeepAliveTuning,
	estimateDeadPeerDetectionSeconds,
} from "./tcpKeepAlive";

const makeLogger = () =>
	({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }) as unknown as Logger;

const readerOf =
	(values: Record<string, string>) =>
	(path: string): string => {
		const value = values[path];
		if (value === undefined) {
			throw new Error("ENOENT");
		}

		return value;
	};

describe("estimateDeadPeerDetectionSeconds", () => {
	it("is the idle delay plus every unanswered probe", () => {
		expect(
			estimateDeadPeerDetectionSeconds({ idleSeconds: 1, intervalSeconds: 5, probes: 3 }),
		).toBe(16);
	});

	it("matches the Linux defaults of roughly eleven minutes", () => {
		expect(
			estimateDeadPeerDetectionSeconds({ idleSeconds: 1, intervalSeconds: 75, probes: 9 }),
		).toBe(676);
	});
});

describe("checkTcpKeepAliveTuning", () => {
	it("waits one second before the first probe", () => {
		expect(TCP_KEEPALIVE_INITIAL_DELAY_MS).toBe(1000);
	});

	it("warns when the kernel defaults would take longer than the budget", () => {
		const logger = makeLogger();

		const seconds = checkTcpKeepAliveTuning(
			logger,
			readerOf({
				"/proc/sys/net/ipv4/tcp_keepalive_intvl": "75\n",
				"/proc/sys/net/ipv4/tcp_keepalive_probes": "9\n",
			}),
		);

		expect(seconds).toBe(676);
		expect(logger.warn).toHaveBeenCalledWith(
			expect.stringContaining("tcp_keepalive"),
			expect.objectContaining({ detectionSeconds: 676, budgetSeconds: DEAD_PEER_BUDGET_SECONDS }),
		);
	});

	it("stays quiet when dead peers are noticed within the budget", () => {
		const logger = makeLogger();

		const seconds = checkTcpKeepAliveTuning(
			logger,
			readerOf({
				"/proc/sys/net/ipv4/tcp_keepalive_intvl": "5",
				"/proc/sys/net/ipv4/tcp_keepalive_probes": "3",
			}),
		);

		expect(seconds).toBe(16);
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it("skips the check where the kernel settings cannot be read", () => {
		const logger = makeLogger();

		expect(checkTcpKeepAliveTuning(logger, readerOf({}))).toBeUndefined();
		expect(logger.warn).not.toHaveBeenCalled();
	});
});
