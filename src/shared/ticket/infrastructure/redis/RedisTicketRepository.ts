import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { TicketRepository } from "../../domain/TicketRepository";

/**
 * Matches the canonical UUID v4 format: xxxxxxxx-xxxx-4xxx-[89ab]xxx-xxxxxxxxxxxx.
 * Validated BEFORE any Redis operation to prevent key injection.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Redis adapter for single-use ticket consumption.
 *
 * Security properties:
 *  - UUID format validated before any Redis call (prevents key injection)
 *  - GETDEL is atomic: reads and deletes in one operation (replay prevention)
 *  - Fail-closed: returns null whenever Redis is unavailable (ranked status never granted)
 */
export class RedisTicketRepository implements TicketRepository {
  async consume(uuid: string): Promise<string | null> {
    if (!UUID_RE.test(uuid)) {
      return null;
    }

    const redis = Redis.getInstance();
    if (!redis) {
      return null;
    }

    const userId = await redis.getdel(`ticket:${uuid}`);

    return userId ?? null;
  }
}
