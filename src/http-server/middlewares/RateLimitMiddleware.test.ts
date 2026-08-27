import type { NextFunction, Request, Response } from "express";

import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { config } from "src/config";

import {
	EnqueueRateLimitMiddleware,
	isRateLimited,
	RateLimitMiddleware,
	RateLimitStore,
} from "./RateLimitMiddleware";

class FakeRedis implements RateLimitStore {
	private counters = new Map<string, number>();
	expireCalls: Array<{ key: string; seconds: number }> = [];

	async incr(key: string): Promise<number> {
		const next = (this.counters.get(key) ?? 0) + 1;
		this.counters.set(key, next);

		return next;
	}

	async expire(key: string, seconds: number): Promise<unknown> {
		this.expireCalls.push({ key, seconds });

		return 1;
	}

	count(key: string): number {
		return this.counters.get(key) ?? 0;
	}
}

describe("isRateLimited", () => {
	it("allows requests up to the limit and blocks the ones beyond it", async () => {
		const redis = new FakeRedis();
		const verdicts: boolean[] = [];

		for (let i = 0; i < 4; i++) {
			verdicts.push(await isRateLimited(redis, "rate-limit:inspect:1.1.1.1", 3, 60));
		}

		expect(verdicts).toEqual([false, false, false, true]);
	});

	it("sets the expiry only on the first request of the window", async () => {
		const redis = new FakeRedis();

		await isRateLimited(redis, "rate-limit:inspect:1.1.1.1", 3, 60);
		await isRateLimited(redis, "rate-limit:inspect:1.1.1.1", 3, 60);

		expect(redis.expireCalls).toEqual([{ key: "rate-limit:inspect:1.1.1.1", seconds: 60 }]);
	});

	it("tracks each ip independently", async () => {
		const redis = new FakeRedis();

		await isRateLimited(redis, "rate-limit:inspect:1.1.1.1", 1, 60);
		const firstForSecondIp = await isRateLimited(redis, "rate-limit:inspect:2.2.2.2", 1, 60);

		expect(firstForSecondIp).toBe(false);
	});
});

describe("scoped rate-limit buckets", () => {
	type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

	let store: FakeRedis;
	let enabledBefore: boolean;

	beforeEach(() => {
		store = new FakeRedis();
		jest
			.spyOn(Redis, "getInstance")
			.mockReturnValue(store as unknown as ReturnType<typeof Redis.getInstance>);
		enabledBefore = config.rateLimit.enabled;
		config.rateLimit.enabled = true;
	});

	afterEach(() => {
		config.rateLimit.enabled = enabledBefore;
		jest.restoreAllMocks();
	});

	const call = async (middleware: Middleware, ip: string) => {
		let statusCode = 0;
		const res = {
			status(code: number) {
				statusCode = code;
				return this;
			},
			json() {
				return this;
			},
		} as unknown as Response;
		const next = jest.fn();
		await middleware({ ip } as Request, res, next);

		return { status: statusCode, nexted: next.mock.calls.length > 0 };
	};

	/** Drives a middleware until it answers 429; fails the test if it never does. */
	const exhaust = async (middleware: Middleware, ip: string): Promise<number> => {
		for (let i = 1; i <= 1_000; i++) {
			const { status } = await call(middleware, ip);
			if (status === 429) {
				return i;
			}
		}
		throw new Error("middleware never rate-limited");
	};

	it("keeps the shared inspect bucket on its deployed key and 60 req/min budget", async () => {
		const calls = await exhaust(RateLimitMiddleware, "9.9.9.9");

		expect(calls).toBe(61);
		expect(store.expireCalls).toEqual([{ key: "rate-limit:inspect:9.9.9.9", seconds: 60 }]);
	});

	it("gives the enqueue route its own key so it never shares the inspect bucket", async () => {
		await exhaust(EnqueueRateLimitMiddleware, "9.9.9.9");

		expect(store.count("rate-limit:enqueue:9.9.9.9")).toBeGreaterThan(0);
		expect(store.count("rate-limit:inspect:9.9.9.9")).toBe(0);
	});

	it("an exhausted enqueue bucket does not consume the inspect bucket", async () => {
		await exhaust(EnqueueRateLimitMiddleware, "1.1.1.1");

		const inspect = await call(RateLimitMiddleware, "1.1.1.1");

		expect(inspect.status).not.toBe(429);
		expect(inspect.nexted).toBe(true);
	});

	it("an exhausted inspect bucket does not consume the enqueue bucket", async () => {
		await exhaust(RateLimitMiddleware, "1.1.1.1");

		const enqueue = await call(EnqueueRateLimitMiddleware, "1.1.1.1");

		expect(enqueue.status).not.toBe(429);
		expect(enqueue.nexted).toBe(true);
	});
});
