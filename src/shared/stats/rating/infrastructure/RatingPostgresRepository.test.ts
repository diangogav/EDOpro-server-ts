import { Rating } from "../domain/Rating";
import { RatingPostgresRepository } from "./RatingPostgresRepository";
import { dataSource } from "../../../../evolution-types/src/data-source";

// This suite mocks TypeORM's `dataSource` (same pattern as
// `UserProfilePostgresRepository.test.ts`): the repo has no real-Postgres
// jest harness. It proves the exact SQL/parameter contract issued to
// Postgres (ON CONFLICT target, row-lock ordering) but not that Postgres
// enforces it — the UNIQUE(match_id, user_id, kind) index this adapter
// targets is created and exercised by the CreateRatingTables migration.
jest.mock("../../../../evolution-types/src/data-source", () => ({
	dataSource: {
		transaction: jest.fn(),
		query: jest.fn(),
	},
}));

describe("RatingPostgresRepository", () => {
	let repository: RatingPostgresRepository;
	let manager: { query: jest.Mock };

	beforeEach(() => {
		jest.clearAllMocks();
		manager = { query: jest.fn() };
		(dataSource.transaction as jest.Mock).mockImplementation(
			async (work: (manager: unknown) => Promise<unknown>) => work(manager),
		);
		repository = new RatingPostgresRepository();
	});

	describe("transaction()", () => {
		it("locks player_ratings rows ordered by user_id ascending, defaulting missing rows to a fresh rating", async () => {
			manager.query
				.mockResolvedValueOnce([]) // advisory lock user-a
				.mockResolvedValueOnce([]) // advisory lock user-b
				.mockResolvedValueOnce([{ userId: "user-b", rating: 1200, gamesPlayed: 15, peak: 1250 }]); // FOR UPDATE row lock

			const result = await repository.transaction(
				["user-b", "user-a"],
				"rank-1",
				5,
				async (ratings) => ratings,
			);

			expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY user_id ASC"), [
				"rank-1",
				5,
				["user-a", "user-b"],
			]);
			expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [
				"rank-1",
				5,
				["user-a", "user-b"],
			]);

			expect(result.get("user-b")).toEqual(
				Rating.from({ value: 1200, gamesPlayed: 15, peak: 1250 }),
			);
			expect(result.get("user-a")).toEqual(Rating.initialize());
		});

		it("acquires a pg_advisory_xact_lock per participant, ordered by user_id ascending, before the FOR UPDATE row lock", async () => {
			manager.query.mockResolvedValue([]);

			await repository.transaction(["user-b", "user-a"], "rank-1", 5, async (ratings) => ratings);

			const calls = manager.query.mock.calls;

			expect(calls[0]).toEqual([
				expect.stringContaining("pg_advisory_xact_lock"),
				["user-a", "rank-1", 5],
			]);
			expect(calls[1]).toEqual([
				expect.stringContaining("pg_advisory_xact_lock"),
				["user-b", "rank-1", 5],
			]);
			expect(calls[2][0]).toEqual(expect.stringContaining("FOR UPDATE"));

			// hashtextextended over a length-prefixed encoding stays injective even
			// when a field's value contains the delimiter, unlike a plain "a|b|c" join.
			expect(calls[0][0]).toEqual(expect.stringContaining("hashtextextended"));
			expect(calls[0][0]).toEqual(expect.stringContaining("length($2)"));
		});

		it("skips advisory locking entirely when there are no participants", async () => {
			manager.query.mockResolvedValueOnce([]); // FOR UPDATE row lock

			await repository.transaction([], "rank-1", 5, async (ratings) => ratings);

			expect(manager.query).toHaveBeenCalledTimes(1);
			expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [
				"rank-1",
				5,
				[],
			]);
		});
	});

	describe("RatingTransaction.insertHistory()", () => {
		it("returns true when the ON CONFLICT DO NOTHING insert produced a row", async () => {
			manager.query
				.mockResolvedValueOnce([]) // lock query
				.mockResolvedValueOnce([{ id: "history-row-1" }]); // insert

			let inserted = false;
			await repository.transaction([], "rank-1", 5, async (_ratings, tx) => {
				inserted = await tx.insertHistory({
					matchId: "match-1",
					userId: "user-a",
					rankId: "rank-1",
					season: 5,
					kind: "applied",
					previousRating: 1000,
					delta: 10,
					kFactor: 20,
					opponentRating: 1000,
				});
			});

			expect(inserted).toBe(true);
			expect(manager.query).toHaveBeenCalledWith(
				expect.stringContaining("ON CONFLICT (match_id, user_id, kind) DO NOTHING"),
				["match-1", "user-a", "rank-1", 5, "applied", 1000, 10, 20, 1000],
			);
		});

		it("returns false — a no-op — when the row already exists for (match_id, user_id, kind)", async () => {
			manager.query
				.mockResolvedValueOnce([]) // lock query
				.mockResolvedValueOnce([]); // conflicting insert returns no rows

			let inserted = true;
			await repository.transaction([], "rank-1", 5, async (_ratings, tx) => {
				inserted = await tx.insertHistory({
					matchId: "match-1",
					userId: "user-a",
					rankId: "rank-1",
					season: 5,
					kind: "applied",
					previousRating: 1000,
					delta: 10,
					kFactor: 20,
					opponentRating: 1000,
				});
			});

			expect(inserted).toBe(false);
		});
	});

	describe("findMany()", () => {
		it("R1 — reads current ratings for the given users without acquiring any row lock", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce([
				{ userId: "user-a", rating: 1200, gamesPlayed: 15, peak: 1250 },
			]);

			const result = await repository.findMany(["user-a"], "rank-1", 5);

			expect(dataSource.query).toHaveBeenCalledTimes(1);
			expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), ["rank-1", 5, ["user-a"]]);
			expect((dataSource.query as jest.Mock).mock.calls[0][0]).not.toEqual(
				expect.stringContaining("FOR UPDATE"),
			);
			expect(dataSource.transaction).not.toHaveBeenCalled();
			expect(result.get("user-a")).toEqual(
				Rating.from({ value: 1200, gamesPlayed: 15, peak: 1250 }),
			);
		});

		it("R2 — defaults a user with no rating row to the season-start value (1000)", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce([]);

			const result = await repository.findMany(["user-a"], "rank-1", 5);

			expect(result.get("user-a")).toEqual(Rating.initialize());
		});

		it("R3 — reads without acquiring the advisory participant locks used by the write path", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce([]);

			await repository.findMany(["user-a", "user-b"], "rank-1", 5);

			expect(dataSource.query).toHaveBeenCalledTimes(1);
			expect((dataSource.query as jest.Mock).mock.calls[0][0]).not.toEqual(
				expect.stringContaining("pg_advisory_xact_lock"),
			);
		});
	});

	describe("RatingTransaction.saveRating()", () => {
		it("upserts the player_ratings projection keyed by (user_id, rank_id, season)", async () => {
			manager.query.mockResolvedValueOnce([]); // lock query

			await repository.transaction([], "rank-1", 5, async (_ratings, tx) => {
				await tx.saveRating(
					"user-a",
					"rank-1",
					5,
					Rating.from({ value: 1010, gamesPlayed: 21, peak: 1010 }),
				);
			});

			expect(manager.query).toHaveBeenCalledWith(
				expect.stringContaining("ON CONFLICT (user_id, rank_id, season)"),
				["user-a", "rank-1", 5, 1010, 21, 1010],
			);
		});
	});
});
