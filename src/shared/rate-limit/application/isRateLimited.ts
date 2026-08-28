export interface RateLimitStore {
	incr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<unknown>;
}

/**
 * Fixed-window counter over one store bucket: INCR the key, arm the window
 * expiry on the first hit only, and report whether the count exceeded `max`.
 * Shared by the HTTP middlewares and the ygopro socket JOIN path so every
 * limiter counts the same way against the same Redis semantics.
 */
export async function isRateLimited(
	store: RateLimitStore,
	key: string,
	max: number,
	windowSeconds: number,
): Promise<boolean> {
	const attempts = await store.incr(key);
	if (attempts === 1) {
		await store.expire(key, windowSeconds);
	}

	return attempts > max;
}
