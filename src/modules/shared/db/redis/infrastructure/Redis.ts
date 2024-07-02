import RedisLibrary from "ioredis";

import { config } from "../../../../../config";
import { Database } from "../../domain/Database";

export class Redis implements Database {
	private static instance?: RedisLibrary;

	static getInstance(): RedisLibrary {

		if (!config.useRedis || !config.redis.uri) {
			console.info("Redis is not enabled or URI is not set.");
			return undefined;
		}

		if (Redis.instance === undefined) {
			Redis.instance = new RedisLibrary(config.redis.uri as string);
		}

		return Redis.instance;
	}

	async connect(): Promise<void> {
		// do something
	}
}
