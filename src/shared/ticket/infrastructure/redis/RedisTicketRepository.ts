import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { redactSecret } from "@shared/logger/domain/redactSecret";
import LoggerFactory from "@shared/logger/infrastructure/LoggerFactory";
import {
	HandshakeTicketStore,
	TicketConsumeResult,
	TicketRepository,
} from "../../domain/TicketRepository";

/**
 * Matches the canonical UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx.
 * Validated BEFORE any Redis operation to prevent key injection.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Upper bound on one ticket lookup so a stalled Redis cannot hold a WS handshake open.
export const TICKET_STORE_TIMEOUT_MS = 2000;

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
export class RedisTicketRepository implements TicketRepository, HandshakeTicketStore {
	private readonly logger = LoggerFactory.getLogger({ file: "RedisTicketRepository" });

	async consume(uuid: string): Promise<string | null> {
		const result = await this.consumeWithStatus(uuid);

		// fail-closed: an unavailable store never grants an identity
		return result.status === "consumed" ? result.userId : null;
	}

	async consumeWithStatus(uuid: string): Promise<TicketConsumeResult> {
		if (!UUID_RE.test(uuid)) {
			this.logger.warn("Ticket consume rejected: token is not a valid UUID v4", {
				uuidPreview: redactSecret(uuid),
			});
			return { status: "invalid" };
		}

		const redis = Redis.getInstance();
		if (!redis) {
			this.logger.warn("Ticket consume unavailable: no Redis instance available");
			return { status: "unavailable" };
		}

		try {
			const userId = await withTimeout(redis.getdel(`ticket:${uuid}`), TICKET_STORE_TIMEOUT_MS);
			if (userId == null) {
				this.logger.warn(
					"Ticket consume rejected: key not found (expired, already consumed, or issued against a different Redis)",
					{ key: `ticket:${redactSecret(uuid)}` },
				);
				return { status: "invalid" };
			}
			this.logger.info("Ticket consumed", { key: `ticket:${redactSecret(uuid)}`, userId });
			return { status: "consumed", userId };
		} catch (error) {
			this.logger.error("Ticket consume unavailable: Redis error or timeout", {
				error: error instanceof Error ? error.message : String(error),
			});
			return { status: "unavailable" };
		}
	}
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`ticket store timed out after ${timeoutMs}ms`)),
			timeoutMs,
		);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});
