import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { RedisTicketRepository } from "./RedisTicketRepository";

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
});
