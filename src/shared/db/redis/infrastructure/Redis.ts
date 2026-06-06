import RedisLibrary from "ioredis";

import { config } from "../../../../config";
import { Database } from "../../../../evolution-types/src/Database";
import { Logger } from "../../../logger/domain/Logger";
import LoggerFactory from "../../../logger/infrastructure/LoggerFactory";

export class Redis implements Database {
	private static readonly logger: Logger = LoggerFactory.getLogger();
	private static instance?: RedisLibrary;

	static getInstance(): RedisLibrary | undefined {
		if (!config.redis.use || !config.redis.uri) {
			this.logger.info("Redis is not enabled or URI is not set.");

			return undefined;
		}

		if (Redis.instance === undefined) {
			Redis.instance = new RedisLibrary(config.redis.uri);
		}

		return Redis.instance;
	}

	/** Reset singleton — test use only. */
	static resetForTests(): void {
		Redis.instance = undefined;
	}

	async connect(): Promise<void> {
		const redis = Redis.getInstance();
		if (!redis) return; // not configured; getInstance() already logged
		redis.on("ready", () => Redis.logger.info("Redis connection ready"));
		redis.on("error", (err: Error) => Redis.logger.error(`Redis connection error: ${err.message}`));
		redis.on("reconnecting", () => Redis.logger.warn("Redis reconnecting"));
	}
}
