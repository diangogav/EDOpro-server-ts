export type RetryPolicy = {
	readonly attempts: number;
	readonly baseDelayMs: number;
};

export const DEFAULT_RETRY_POLICY: RetryPolicy = { attempts: 5, baseDelayMs: 500 };

const wait = (ms: number): Promise<void> =>
	new Promise((resolve) => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
	});

/**
 * Runs `operation` until it resolves, doubling the delay between attempts.
 * Rejects with the last error once every attempt failed.
 */
export async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	policy: RetryPolicy = DEFAULT_RETRY_POLICY,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < policy.attempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			if (attempt < policy.attempts - 1) {
				await wait(policy.baseDelayMs * 2 ** attempt);
			}
		}
	}

	throw lastError;
}
