import RedisLibrary from "ioredis";

import { config } from "../../../../config";
import { Database } from "../../../../evolution-types/src/Database";
import { Pino } from "../../../logger/infrastructure/Pino";

export class Redis implements Database {
	private static readonly logger: Pino = new Pino();
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

	async connect(): Promise<void> {
		// do something
	}
}
