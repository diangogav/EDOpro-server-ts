import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { RedisTicketRepository, TICKET_STORE_TIMEOUT_MS } from "./RedisTicketRepository";

jest.mock("@shared/db/redis/infrastructure/Redis", () => ({
	Redis: {
		getInstance: jest.fn(),
	},
}));

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

const makeRedisInstance = (getdelResult: string | null) => ({
	getdel: jest.fn().mockResolvedValue(getdelResult),
});

describe("RedisTicketRepository", () => {
	let repo: RedisTicketRepository;

	beforeEach(() => {
		jest.clearAllMocks();
		repo = new RedisTicketRepository();
	});

	describe("consume()", () => {
		it("returns the userId when the ticket exists (hit)", async () => {
			const redisInstance = makeRedisInstance("user-abc");
			(Redis.getInstance as jest.Mock).mockReturnValue(redisInstance);

			const result = await repo.consume(VALID_UUID);

			expect(result).toBe("user-abc");
		});

		it("returns null when the ticket does not exist (miss)", async () => {
			const redisInstance = makeRedisInstance(null);
			(Redis.getInstance as jest.Mock).mockReturnValue(redisInstance);

			const result = await repo.consume(VALID_UUID);

			expect(result).toBeNull();
		});

		it("returns null without calling getdel when UUID format is invalid", async () => {
			const redisInstance = makeRedisInstance("user-xyz");
			(Redis.getInstance as jest.Mock).mockReturnValue(redisInstance);

			const result = await repo.consume("not-a-uuid");

			expect(redisInstance.getdel).not.toHaveBeenCalled();
			expect(result).toBeNull();
		});

		it("returns null when Redis is unavailable (fail-closed)", async () => {
			(Redis.getInstance as jest.Mock).mockReturnValue(undefined);

			const result = await repo.consume(VALID_UUID);

			expect(result).toBeNull();
		});

		it("calls getdel with key ticket:<uuid>", async () => {
			const redisInstance = makeRedisInstance("user-789");
			(Redis.getInstance as jest.Mock).mockReturnValue(redisInstance);

			await repo.consume(VALID_UUID);

			expect(redisInstance.getdel).toHaveBeenCalledWith(`ticket:${VALID_UUID}`);
		});

		it("returns null without propagating when getdel rejects (fail-closed on Redis error)", async () => {
			const redisInstance = {
				getdel: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
			};
			(Redis.getInstance as jest.Mock).mockReturnValue(redisInstance);

			const result = await repo.consume(VALID_UUID);

			expect(result).toBeNull();
		});
	});

	describe("consumeWithStatus()", () => {
		it("reports a hit as consumed", async () => {
			(Redis.getInstance as jest.Mock).mockReturnValue(makeRedisInstance("user-abc"));

			await expect(repo.consumeWithStatus(VALID_UUID)).resolves.toEqual({
				status: "consumed",
				userId: "user-abc",
			});
		});

		it("reports a missing or already consumed ticket as invalid", async () => {
			(Redis.getInstance as jest.Mock).mockReturnValue(makeRedisInstance(null));

			await expect(repo.consumeWithStatus(VALID_UUID)).resolves.toEqual({ status: "invalid" });
		});

		it("reports a malformed ticket as invalid without touching Redis", async () => {
			const redisInstance = makeRedisInstance("user-xyz");
			(Redis.getInstance as jest.Mock).mockReturnValue(redisInstance);

			await expect(repo.consumeWithStatus("not-a-uuid")).resolves.toEqual({ status: "invalid" });
			expect(redisInstance.getdel).not.toHaveBeenCalled();
		});

		it("reports a Redis error as unavailable", async () => {
			(Redis.getInstance as jest.Mock).mockReturnValue({
				getdel: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")),
			});

			await expect(repo.consumeWithStatus(VALID_UUID)).resolves.toEqual({
				status: "unavailable",
			});
		});

		it("reports a missing Redis instance as unavailable", async () => {
			(Redis.getInstance as jest.Mock).mockReturnValue(undefined);

			await expect(repo.consumeWithStatus(VALID_UUID)).resolves.toEqual({
				status: "unavailable",
			});
		});

		it("reports a Redis call that never answers as unavailable after the timeout", async () => {
			jest.useFakeTimers();
			try {
				(Redis.getInstance as jest.Mock).mockReturnValue({
					getdel: jest.fn().mockReturnValue(new Promise(() => undefined)),
				});

				const pending = repo.consumeWithStatus(VALID_UUID);
				await jest.advanceTimersByTimeAsync(TICKET_STORE_TIMEOUT_MS);

				await expect(pending).resolves.toEqual({ status: "unavailable" });
			} finally {
				jest.useRealTimers();
			}
		});
	});
});
