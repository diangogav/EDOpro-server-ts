import { NextFunction, Request, Response } from "express";

import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { isRateLimited, RateLimitStore } from "@shared/rate-limit/application/isRateLimited";
import { config } from "src/config";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 60;
// Entering the queue is a rare, deliberate action (one POST per match attempt),
// so its budget can be far smaller than the read/poll budget while still
// covering several players behind one shared NAT IP.
const ENQUEUE_MAX_REQUESTS = 20;

export { isRateLimited };
export type { RateLimitStore };

export type RateLimitMiddlewareFn = (
	request: Request,
	response: Response,
	next: NextFunction,
) => Promise<void>;

/**
 * Builds a per-IP fixed-window limiter over its own Redis bucket
 * (`rate-limit:<scope>:<ip>`). Separate scopes keep budgets independent: a
 * client saturating one scope's bucket cannot 429 another scope's traffic.
 */
export function createRateLimitMiddleware(
	scope: string,
	max: number,
	windowSeconds: number = WINDOW_SECONDS,
): RateLimitMiddlewareFn {
	return async function rateLimit(
		request: Request,
		response: Response,
		next: NextFunction,
	): Promise<void> {
		const redis = Redis.getInstance();
		const ip = request.ip;

		if (!config.rateLimit.enabled || !redis || !ip) {
			next();

			return;
		}

		try {
			const limited = await isRateLimited(redis, `rate-limit:${scope}:${ip}`, max, windowSeconds);
			if (limited) {
				response.status(429).json({ error: "Too many requests. Please slow down." });

				return;
			}
		} catch {
			// Fail-open: a limiter error must never take down a public read-only page.
		}

		next();
	};
}

/**
 * Shared bucket for read/poll style routes. The "inspect" key segment is live
 * deployed Redis state (and ops tooling may match on it) — keep it stable.
 */
export const RateLimitMiddleware = createRateLimitMiddleware("inspect", MAX_REQUESTS);

/**
 * Dedicated bucket for POST /api/matchmaking/queue so status-poll traffic from
 * other clients behind the same IP can never starve a player's enqueue.
 */
export const EnqueueRateLimitMiddleware = createRateLimitMiddleware(
	"enqueue",
	ENQUEUE_MAX_REQUESTS,
);
