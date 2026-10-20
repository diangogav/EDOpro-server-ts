import { YgoClient } from "@shared/client/domain/YgoClient";
import { Logger } from "@shared/logger/domain/Logger";
import { ISocket } from "@shared/socket/domain/ISocket";

import { logReconnectAttempt } from "./logReconnectAttempt";

const TOKEN = "0123456789abcdef0123456789abcdef";

describe("logReconnectAttempt", () => {
	const logger = { info: jest.fn() } as unknown as jest.Mocked<Logger>;
	const socket = { transport: "ws" } as unknown as ISocket;

	beforeEach(() => jest.clearAllMocks());

	it("logs one info line with the structured fields", () => {
		const client = { isStrongAuth: true } as unknown as YgoClient;

		logReconnectAttempt(logger, {
			path: "token",
			outcome: "forwarded",
			socket,
			client,
			identityChecked: true,
			token: TOKEN,
		});

		expect(logger.info).toHaveBeenCalledTimes(1);
		expect(logger.info).toHaveBeenCalledWith("reconnect.attempt", {
			path: "token",
			outcome: "forwarded",
			transport: "ws",
			verified: true,
			identityChecked: true,
			tokenPrefix: "012345…",
		});
	});

	it("never carries the full token", () => {
		logReconnectAttempt(logger, {
			path: "token",
			outcome: "unknown_token",
			socket,
			client: null,
			identityChecked: false,
			token: TOKEN,
		});

		expect(JSON.stringify(logger.info.mock.calls)).not.toContain(TOKEN);
	});

	it("reports an unknown seat as unverified and a by-name attempt without a token prefix", () => {
		logReconnectAttempt(logger, {
			path: "by-name",
			outcome: "matched",
			socket: { transport: "tcp" } as unknown as ISocket,
			client: null,
			identityChecked: false,
		});

		expect(logger.info).toHaveBeenCalledWith("reconnect.attempt", {
			path: "by-name",
			outcome: "matched",
			transport: "tcp",
			verified: false,
			identityChecked: false,
			tokenPrefix: null,
		});
	});
});
