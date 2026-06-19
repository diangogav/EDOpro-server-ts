import { Redis } from "@shared/db/redis/infrastructure/Redis";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import { TicketRepository } from "../../domain/TicketRepository";

/**
 * Matches the canonical UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx.
 * Validated BEFORE any Redis operation to prevent key injection.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Redis adapter for single-use ticket consumption.
 *
 * Security properties:
 *  - UUID format validated before any Redis call (prevents key injection)
 *  - GETDEL is atomic: reads and deletes in one operation (replay prevention)
 *  - Fail-closed: returns null whenever Redis is unavailable (ranked status never granted)
 *
 * Every rejection is logged with its reason so ranked-auth failures are
 * diagnosable in production (the consume result is otherwise just null).
 */
export class RedisTicketRepository implements TicketRepository {
	private readonly logger = LoggerFactory.getLogger({ file: "RedisTicketRepository" });

	async consume(uuid: string): Promise<string | null> {
		if (!UUID_RE.test(uuid)) {
			this.logger.warn("Ticket consume rejected: token is not a valid UUID v4", {
				uuidPreview: uuid.slice(0, 8),
			});
			return null;
		}

		const redis = Redis.getInstance();
		if (!redis) {
			this.logger.warn("Ticket consume rejected: no Redis instance available");
			return null;
		}

		try {
			const userId = await redis.getdel(`ticket:${uuid}`);
			if (userId == null) {
				this.logger.warn(
					"Ticket consume rejected: key not found (expired, already consumed, or issued against a different Redis)",
					{ key: `ticket:${uuid}` },
				);
				return null;
			}
			this.logger.info("Ticket consumed", { key: `ticket:${uuid}`, userId });
			return userId;
		} catch (error) {
			this.logger.error("Ticket consume rejected: Redis error (fail-closed)", {
				error: error instanceof Error ? error.message : String(error),
			});
			return null; // fail-closed: Redis error never grants ranked status
		}
	}
}
