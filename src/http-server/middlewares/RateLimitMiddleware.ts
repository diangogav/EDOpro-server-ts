import { NextFunction, Request, Response } from "express";

import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { config } from "src/config";

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 60;

export interface RateLimitStore {
	incr(key: string): Promise<number>;
	expire(key: string, seconds: number): Promise<unknown>;
}

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

export async function RateLimitMiddleware(
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
		const limited = await isRateLimited(
			redis,
			`rate-limit:inspect:${ip}`,
			MAX_REQUESTS,
			WINDOW_SECONDS,
		);
		if (limited) {
			response.status(429).json({ error: "Too many requests. Please slow down." });

			return;
		}
	} catch {
		// Fail-open: a limiter error must never take down a public read-only page.
	}

	next();
}
