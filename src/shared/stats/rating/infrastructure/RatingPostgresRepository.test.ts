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
			manager.query.mockResolvedValueOnce([
				{ userId: "user-b", rating: 1200, gamesPlayed: 15, peak: 1250 },
			]);

			const result = await repository.transaction(
				["user-b", "user-a"],
				"TCG",
				5,
				async (ratings) => ratings,
			);

			expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("ORDER BY user_id ASC"), [
				"TCG",
				5,
				["user-a", "user-b"],
			]);
			expect(manager.query).toHaveBeenCalledWith(expect.stringContaining("FOR UPDATE"), [
				"TCG",
				5,
				["user-a", "user-b"],
			]);

			expect(result.get("user-b")).toEqual(
				Rating.from({ value: 1200, gamesPlayed: 15, peak: 1250 }),
			);
			expect(result.get("user-a")).toEqual(Rating.initialize());
		});
	});

	describe("RatingTransaction.insertHistory()", () => {
		it("returns true when the ON CONFLICT DO NOTHING insert produced a row", async () => {
			manager.query
				.mockResolvedValueOnce([]) // lock query
				.mockResolvedValueOnce([{ id: "history-row-1" }]); // insert

			let inserted = false;
			await repository.transaction([], "TCG", 5, async (_ratings, tx) => {
				inserted = await tx.insertHistory({
					matchId: "match-1",
					userId: "user-a",
					banListName: "TCG",
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
				["match-1", "user-a", "TCG", 5, "applied", 1000, 10, 20, 1000],
			);
		});

		it("returns false — a no-op — when the row already exists for (match_id, user_id, kind)", async () => {
			manager.query
				.mockResolvedValueOnce([]) // lock query
				.mockResolvedValueOnce([]); // conflicting insert returns no rows

			let inserted = true;
			await repository.transaction([], "TCG", 5, async (_ratings, tx) => {
				inserted = await tx.insertHistory({
					matchId: "match-1",
					userId: "user-a",
					banListName: "TCG",
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

	describe("RatingTransaction.saveRating()", () => {
		it("upserts the player_ratings projection keyed by (user_id, ban_list_name, season)", async () => {
			manager.query.mockResolvedValueOnce([]); // lock query

			await repository.transaction([], "TCG", 5, async (_ratings, tx) => {
				await tx.saveRating(
					"user-a",
					"TCG",
					5,
					Rating.from({ value: 1010, gamesPlayed: 21, peak: 1010 }),
				);
			});

			expect(manager.query).toHaveBeenCalledWith(
				expect.stringContaining("ON CONFLICT (user_id, ban_list_name, season)"),
				["user-a", "TCG", 5, 1010, 21, 1010],
			);
		});
	});
});
