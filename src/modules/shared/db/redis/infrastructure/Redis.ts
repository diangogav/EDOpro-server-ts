import { createClient, RedisClientType } from "redis";

import { config } from "../../../../../config";
import { Logger } from "../../../logger/domain/Logger";
import { Database } from "../../domain/Database";

export class Redis implements Database {
	private readonly client: RedisClientType;
	private readonly logger: Logger;

	constructor(logger: Logger) {
		this.logger = logger;
		this.client = createClient({
			url: config.redis.uri,
		});
	}

	async connect(): Promise<void> {
		if (!config.redis.uri) {
			return;
		}

		await this.client.connect();
		this.logger.info("Redis connected.");
	}
}
