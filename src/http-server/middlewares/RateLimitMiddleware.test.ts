import { isRateLimited, RateLimitStore } from "./RateLimitMiddleware";

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
