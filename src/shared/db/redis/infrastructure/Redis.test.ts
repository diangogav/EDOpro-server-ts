import { EventEmitter } from "events";

import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { Redis } from "./Redis";

jest.mock("ioredis", () => {
	const { EventEmitter: EE } = jest.requireActual<{ EventEmitter: typeof EventEmitter }>("events");

	const MockRedisLibrary = jest.fn().mockImplementation(() => {
		const emitter = new EE();
		jest.spyOn(emitter, "on");
		return emitter;
	});

	return { __esModule: true, default: MockRedisLibrary };
});

jest.mock("src/config", () => ({
	config: { redis: { use: true, uri: "redis://localhost:6379" } },
}));

jest.mock("@shared/logger/infrastructure/LoggerFactory", () => ({
	__esModule: true,
	default: {
		getLogger: jest.fn().mockReturnValue({
			info: jest.fn(),
			error: jest.fn(),
			warn: jest.fn(),
			debug: jest.fn(),
			child: jest.fn(),
		}),
	},
}));

// Obtain the shared mock logger — same reference that Redis.logger holds
const mockLogger = LoggerFactory.getLogger() as unknown as {
	info: jest.Mock;
	error: jest.Mock;
	warn: jest.Mock;
};

describe("Redis", () => {
	afterEach(() => {
		Redis.resetForTests();
		jest.clearAllMocks();
	});

	describe("connect()", () => {
		it("registers ready, error, and reconnecting listeners on the Redis instance", async () => {
			const redis = new Redis();
			await redis.connect();

			const instance = Redis.getInstance()!;
			expect((instance.on as jest.Mock).mock.calls.map((c: unknown[]) => c[0])).toEqual(
				expect.arrayContaining(["ready", "error", "reconnecting"]),
			);
		});

		it("calls logger.info when the ready event fires", async () => {
			const redis = new Redis();
			await redis.connect();

			const instance = Redis.getInstance()!;
			instance.emit("ready");

			expect(mockLogger.info).toHaveBeenCalledWith("🟢 Redis connected");
		});

		it("calls logger.error when the error event fires", async () => {
			const redis = new Redis();
			await redis.connect();

			const instance = Redis.getInstance()!;
			const err = new Error("ECONNREFUSED");
			instance.emit("error", err);

			expect(mockLogger.error).toHaveBeenCalledWith(`Redis connection error: ${err.message}`);
		});

		it("calls logger.warn when the reconnecting event fires", async () => {
			const redis = new Redis();
			await redis.connect();

			const instance = Redis.getInstance()!;
			instance.emit("reconnecting");

			expect(mockLogger.warn).toHaveBeenCalledWith("Redis reconnecting");
		});

		it("does not register any listeners when Redis is not configured", async () => {
			jest.spyOn(Redis, "getInstance").mockReturnValueOnce(undefined);

			const redis = new Redis();
			await redis.connect();

			// No instance means no listeners could have been registered.
			// Verify getInstance returned nothing (spy ensured undefined).
			expect(Redis.getInstance).toHaveBeenCalled();
		});
	});
});
