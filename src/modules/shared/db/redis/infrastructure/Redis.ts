import { createClient, RedisClientType } from "redis";

import { config } from "../../../../../config";
import { Database } from "../../domain/Database";

export class Redis implements Database {
	// eslint-disable-next-line no-use-before-define
	private static instance?: Redis;
	public readonly client: RedisClientType;

	private constructor() {
		this.client = createClient({
			url: config.redis.uri,
		});
	}

	static getInstance(): Redis {
		if (Redis.instance === undefined) {
			Redis.instance = new Redis();
		}

		return Redis.instance;
	}

	async connect(): Promise<void> {
		if (!config.redis.uri) {
			return;
		}

		await this.client.connect();
	}
}
