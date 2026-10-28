import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { Logger } from "@shared/logger/domain/Logger";

import { parseReservation, reservationKey, RESERVATION_ID_PATTERN } from "../../domain/Reservation";
import { ClaimResult, ReservationStore } from "../../domain/ReservationStore";

/** How long a claimed reservation may live before Redis drops it on its own. */
export const CLAIMED_RESERVATION_TTL_SECONDS = 6 * 60 * 60;

/**
 * Atomic claim. KEYS[1] = reservation key; ARGV = instanceId, userId, claim
 * timestamp (ISO), TTL seconds. Returns { status, payload? }. A non-participant
 * never touches the key, so a leaked password cannot burn the reservation.
 * Scripts on one key run serially, so a claim and a revoke never both win.
 */
export const CLAIM_RESERVATION_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return {'missing'} end
local ok, reservation = pcall(cjson.decode, raw)
if not ok or type(reservation) ~= 'table' then return {'missing'} end
local participant = false
if type(reservation.participants) == 'table' then
  for _, p in ipairs(reservation.participants) do
    if type(p) == 'table' and p.kind == 'user' and p.userId == ARGV[2] then participant = true end
  end
end
if not participant then return {'not_participant'} end
local claim = reservation.claim
if claim == nil or claim == cjson.null then
  reservation.claim = { instanceId = ARGV[1], at = ARGV[3] }
  redis.call('SET', KEYS[1], cjson.encode(reservation), 'EX', tonumber(ARGV[4]))
  return {'claimed', raw}
end
if type(claim) == 'table' and claim.instanceId == ARGV[1] then
  return {'already_claimed_here', raw}
end
return {'claimed_elsewhere'}
`;

const CLAIM_TIMEOUT_MS = 2000;

type ScriptReply = [string, string?];

export class RedisReservationStore implements ReservationStore {
	private readonly logger: Logger;

	constructor(
		logger: Logger,
		private readonly now: () => Date = () => new Date(),
	) {
		this.logger = logger.child({ file: "RedisReservationStore" });
	}

	public async claim(
		reservationId: string,
		instanceId: string,
		userId: string,
	): Promise<ClaimResult> {
		if (!RESERVATION_ID_PATTERN.test(reservationId)) {
			return { status: "missing" };
		}
		const redis = Redis.getInstance();
		if (!redis) {
			return { status: "unavailable" };
		}

		let reply: ScriptReply;
		try {
			reply = (await withTimeout(
				redis.eval(
					CLAIM_RESERVATION_SCRIPT,
					1,
					reservationKey(reservationId),
					instanceId,
					userId,
					this.now().toISOString(),
					String(CLAIMED_RESERVATION_TTL_SECONDS),
				),
				CLAIM_TIMEOUT_MS,
			)) as ScriptReply;
		} catch (error) {
			this.logger.error("Reservation claim unavailable", {
				reservationId,
				error: error instanceof Error ? error.message : String(error),
			});
			return { status: "unavailable" };
		}

		const [status, payload] = reply;
		if (status !== "claimed" && status !== "already_claimed_here") {
			if (status === "missing" || status === "not_participant" || status === "claimed_elsewhere") {
				return { status };
			}
			return { status: "unavailable" };
		}

		const reservation = payload ? parseReservation(payload) : null;
		if (!reservation || reservation.id !== reservationId) {
			this.logger.error("Claimed reservation is unreadable", { reservationId, status });
			return { status: "missing" };
		}

		return { status, reservation };
	}

	public async release(reservationId: string): Promise<void> {
		const redis = Redis.getInstance();
		if (!redis) {
			throw new Error("Redis unavailable");
		}
		await redis.del(reservationKey(reservationId));
	}
}

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
	new Promise<T>((resolve, reject) => {
		const timer = setTimeout(
			() => reject(new Error(`reservation store timed out after ${timeoutMs}ms`)),
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
