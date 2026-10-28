import { Redis } from "@shared/db/redis/infrastructure/Redis";
import { LoggerMock } from "@test-support/mocks/logger/LoggerMock";

import {
	CLAIM_RESERVATION_SCRIPT,
	CLAIMED_RESERVATION_TTL_SECONDS,
	RedisReservationStore,
} from "./RedisReservationStore";

jest.mock("@shared/db/redis/infrastructure/Redis", () => ({
	Redis: { getInstance: jest.fn() },
}));

const ID = "Ab3dEf6hIj9kLm2n";
const NOW = new Date("2026-10-31T20:00:00.000Z");

const PAYLOAD = JSON.stringify({
	v: 1,
	reservationId: ID,
	format: "edison",
	mode: "single",
	participants: [
		{ seat: 0, kind: "user", userId: "user-1" },
		{ seat: 1, kind: "windbot", botName: "Haunted" },
	],
	options: {},
	claim: null,
});

const makeRedis = (reply: unknown) => ({
	eval: jest.fn().mockResolvedValue(reply),
	del: jest.fn().mockResolvedValue(1),
});

const makeStore = () => new RedisReservationStore(new LoggerMock(), () => NOW);

describe("RedisReservationStore.claim", () => {
	beforeEach(() => jest.clearAllMocks());

	it("runs the claim script on the reservation key with instance, user, time and TTL", async () => {
		const redis = makeRedis(["claimed", PAYLOAD]);
		(Redis.getInstance as jest.Mock).mockReturnValue(redis);

		await makeStore().claim(ID, "instance-a", "user-1");

		expect(redis.eval).toHaveBeenCalledWith(
			CLAIM_RESERVATION_SCRIPT,
			1,
			`duel:reservation:${ID}`,
			"instance-a",
			"user-1",
			NOW.toISOString(),
			String(CLAIMED_RESERVATION_TTL_SECONDS),
		);
		expect(CLAIMED_RESERVATION_TTL_SECONDS).toBe(6 * 60 * 60);
	});

	it.each([
		"claimed",
		"already_claimed_here",
	] as const)("returns the reservation when the script answers %s", async (status) => {
		(Redis.getInstance as jest.Mock).mockReturnValue(makeRedis([status, PAYLOAD]));

		const result = await makeStore().claim(ID, "instance-a", "user-1");

		expect(result.status).toBe(status);
		expect(result).toMatchObject({ reservation: { id: ID, format: "edison" } });
	});

	it.each([
		"missing",
		"not_participant",
		"claimed_elsewhere",
	] as const)("passes %s through without a reservation", async (status) => {
		(Redis.getInstance as jest.Mock).mockReturnValue(makeRedis([status]));

		expect(await makeStore().claim(ID, "instance-a", "user-1")).toEqual({ status });
	});

	it("never touches Redis for a malformed id", async () => {
		const redis = makeRedis(["claimed", PAYLOAD]);
		(Redis.getInstance as jest.Mock).mockReturnValue(redis);

		expect(await makeStore().claim("../x", "instance-a", "user-1")).toEqual({ status: "missing" });
		expect(redis.eval).not.toHaveBeenCalled();
	});

	it("is unavailable without Redis or when the script fails", async () => {
		(Redis.getInstance as jest.Mock).mockReturnValue(undefined);
		expect(await makeStore().claim(ID, "i", "u")).toEqual({ status: "unavailable" });

		(Redis.getInstance as jest.Mock).mockReturnValue({
			eval: jest.fn().mockRejectedValue(new Error("down")),
		});
		expect(await makeStore().claim(ID, "i", "u")).toEqual({ status: "unavailable" });
	});

	it("treats a claimed but unreadable payload as missing", async () => {
		(Redis.getInstance as jest.Mock).mockReturnValue(makeRedis(["claimed", "{}"]));

		expect(await makeStore().claim(ID, "i", "u")).toEqual({ status: "missing" });
	});
});

describe("RedisReservationStore.release", () => {
	it("deletes the reservation key", async () => {
		const redis = makeRedis(null);
		(Redis.getInstance as jest.Mock).mockReturnValue(redis);

		await makeStore().release(ID);

		expect(redis.del).toHaveBeenCalledWith(`duel:reservation:${ID}`);
	});
});
