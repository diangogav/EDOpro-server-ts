import { PlayerStats } from "../domain/PlayerStats";
import { PointsLedgerEntry } from "../domain/PlayerStatsRepository";
import { PlayerStatsPostgresRepository } from "./PlayerStatsPostgresRepository";
import { dataSource } from "../../../../evolution-types/src/data-source";

// This suite mocks TypeORM's `dataSource` (same pattern as
// `RatingPostgresRepository.test.ts`): the repo has no real-Postgres jest
// harness. It proves the exact SQL/parameter contract issued to Postgres
// (ON CONFLICT target, advisory-lock ordering) but not that Postgres
// enforces it — the UNIQUE(game_id, user_id, rank_id, kind, cycle) index this
// adapter targets is created by the CreatePointsLedger migration.
jest.mock("../../../../evolution-types/src/data-source", () => ({
	dataSource: {
		transaction: jest.fn(),
		query: jest.fn(),
	},
}));

describe("PlayerStatsPostgresRepository", () => {
	let repository: PlayerStatsPostgresRepository;
	let manager: { query: jest.Mock; getRepository: jest.Mock };
	let ormRepo: { findOneBy: jest.Mock; create: jest.Mock; save: jest.Mock };

	beforeEach(() => {
		jest.clearAllMocks();
		ormRepo = { findOneBy: jest.fn(), create: jest.fn(), save: jest.fn() };
		manager = { query: jest.fn(), getRepository: jest.fn().mockReturnValue(ormRepo) };
		(dataSource.transaction as jest.Mock).mockImplementation(
			async (work: (manager: unknown) => Promise<unknown>) => work(manager),
		);
		(dataSource.query as jest.Mock).mockReset();
		repository = new PlayerStatsPostgresRepository();
	});

	describe("transaction()", () => {
		it("acquires a pg_advisory_xact_lock per rankId, ordered ascending, before running work", async () => {
			manager.query.mockResolvedValue([]);

			await repository.transaction("user-a", ["rank-b", "rank-a"], 5, async () => undefined);

			const calls = manager.query.mock.calls;

			expect(calls[0]).toEqual([
				expect.stringContaining("pg_advisory_xact_lock"),
				["user-a", "rank-a", 5],
			]);
			expect(calls[1]).toEqual([
				expect.stringContaining("pg_advisory_xact_lock"),
				["user-a", "rank-b", 5],
			]);

			// hashtextextended over a length-prefixed encoding stays injective even
			// when a field's value contains the delimiter, unlike a plain "a|b|c" join.
			expect(calls[0][0]).toEqual(expect.stringContaining("hashtextextended"));
			expect(calls[0][0]).toEqual(expect.stringContaining("length($2)"));
		});

		it("opens exactly one dataSource.transaction() for the whole work", async () => {
			manager.query.mockResolvedValue([]);

			await repository.transaction("user-a", ["rank-a"], 5, async () => undefined);

			expect(dataSource.transaction).toHaveBeenCalledTimes(1);
		});

		it("skips advisory locking entirely when there are no ranks", async () => {
			await repository.transaction("user-a", [], 5, async () => undefined);

			expect(manager.query).not.toHaveBeenCalled();
		});
	});

	describe("PlayerStatsTransaction.insertLedgerEntry()", () => {
		const entry: PointsLedgerEntry = {
			gameId: "game-1",
			userId: "user-a",
			rankId: "rank-a",
			season: 5,
			kind: "applied",
			cycle: 0,
			pointsDelta: 3,
			winsDelta: 1,
			lossesDelta: 0,
		};

		it("returns true and issues a target-less ON CONFLICT DO NOTHING insert when the row is new", async () => {
			manager.query
				.mockResolvedValueOnce([]) // advisory lock
				.mockResolvedValueOnce([{ id: "ledger-row-1" }]); // insert

			let inserted = false;
			await repository.transaction("user-a", ["rank-a"], 5, async (tx) => {
				inserted = await tx.insertLedgerEntry(entry);
			});

			expect(inserted).toBe(true);
			const insertCall = manager.query.mock.calls[1];
			expect(insertCall[0]).toEqual(expect.stringContaining("ON CONFLICT DO NOTHING"));
			expect(insertCall[0]).not.toEqual(expect.stringContaining("ON CONFLICT ("));
			expect(insertCall[1]).toEqual(["game-1", "user-a", "rank-a", 5, "applied", 0, 3, 1, 0]);
		});

		it("returns false — a no-op — when the row already exists for the unique key", async () => {
			manager.query
				.mockResolvedValueOnce([]) // advisory lock
				.mockResolvedValueOnce([]); // conflicting insert returns no rows

			let inserted = true;
			await repository.transaction("user-a", ["rank-a"], 5, async (tx) => {
				inserted = await tx.insertLedgerEntry(entry);
			});

			expect(inserted).toBe(false);
		});
	});

	describe("PlayerStatsTransaction.findByUserIdAndRankId()", () => {
		it("loads the player_stats row for the transaction's season", async () => {
			manager.query.mockResolvedValueOnce([]); // advisory lock
			ormRepo.findOneBy.mockResolvedValueOnce({
				id: "stats-1",
				rankId: "rank-a",
				userId: "user-a",
				season: 5,
				wins: 3,
				losses: 1,
				points: 6,
			});

			let result: PlayerStats | undefined;
			await repository.transaction("user-a", ["rank-a"], 5, async (tx) => {
				result = await tx.findByUserIdAndRankId("user-a", "rank-a");
			});

			expect(ormRepo.findOneBy).toHaveBeenCalledWith({
				userId: "user-a",
				rankId: "rank-a",
				season: 5,
			});
			expect(result?.points).toBe(6);
		});

		it("initializes a fresh row when none exists for the transaction's season", async () => {
			manager.query.mockResolvedValueOnce([]); // advisory lock
			ormRepo.findOneBy.mockResolvedValueOnce(null);

			let result: PlayerStats | undefined;
			await repository.transaction("user-a", ["rank-a"], 5, async (tx) => {
				result = await tx.findByUserIdAndRankId("user-a", "rank-a");
			});

			expect(result?.points).toBe(0);
			expect(result?.season).toBe(5);
		});
	});

	describe("PlayerStatsTransaction.save()", () => {
		it("persists the player_stats row scoped to the transaction's season", async () => {
			manager.query.mockResolvedValueOnce([]); // advisory lock
			const playerStats = PlayerStats.initialize({ rankId: "rank-a", userId: "user-a", season: 5 });
			ormRepo.create.mockImplementation((data) => data);

			await repository.transaction("user-a", ["rank-a"], 5, async (tx) => {
				await tx.save(playerStats);
			});

			expect(ormRepo.create).toHaveBeenCalledWith(
				expect.objectContaining({ userId: "user-a", rankId: "rank-a", season: 5 }),
			);
			expect(ormRepo.save).toHaveBeenCalled();
		});
	});

	describe("insertLedgerEntries()", () => {
		function makeEntries(count: number): PointsLedgerEntry[] {
			return Array.from({ length: count }, (_, index) => ({
				gameId: `game-${index}`,
				userId: "user-a",
				rankId: "rank-a",
				season: 5,
				kind: "applied" as const,
				cycle: 0,
				pointsDelta: 3,
				winsDelta: 1,
				lossesDelta: 0,
			}));
		}

		it("issues no query for an empty entry list and returns zero counts", async () => {
			const result = await repository.insertLedgerEntries([]);

			expect(dataSource.query).not.toHaveBeenCalled();
			expect(result).toEqual({ inserted: 0, skipped: 0 });
		});

		it("issues exactly one statement for 1,000 entries", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce(
				Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` })),
			);

			const result = await repository.insertLedgerEntries(makeEntries(1000));

			expect(dataSource.query).toHaveBeenCalledTimes(1);
			expect(result).toEqual({ inserted: 1000, skipped: 0 });
		});

		it("issues two statements for 1,001 entries, chunked at 1,000 rows each", async () => {
			(dataSource.query as jest.Mock)
				.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` })))
				.mockResolvedValueOnce([{ id: "row-last" }]);

			const result = await repository.insertLedgerEntries(makeEntries(1001));

			expect(dataSource.query).toHaveBeenCalledTimes(2);
			const [, firstParams] = (dataSource.query as jest.Mock).mock.calls[0];
			const [, secondParams] = (dataSource.query as jest.Mock).mock.calls[1];
			expect(firstParams).toHaveLength(1000 * 9);
			expect(secondParams).toHaveLength(1 * 9);
			expect(result).toEqual({ inserted: 1001, skipped: 0 });
		});

		it("issues a target-less ON CONFLICT DO NOTHING statement, never a named conflict target", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce([{ id: "row-0" }]);

			await repository.insertLedgerEntries(makeEntries(1));

			const [sql] = (dataSource.query as jest.Mock).mock.calls[0];
			expect(sql).toEqual(expect.stringContaining("ON CONFLICT DO NOTHING"));
			expect(sql).not.toEqual(expect.stringContaining("ON CONFLICT ("));
		});

		it("flattens parameters in the same column order as the single-row insert", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce([{ id: "row-0" }, { id: "row-1" }]);

			await repository.insertLedgerEntries([
				{
					gameId: "game-1",
					userId: "user-a",
					rankId: "rank-a",
					season: 5,
					kind: "applied",
					cycle: 0,
					pointsDelta: 3,
					winsDelta: 1,
					lossesDelta: 0,
				},
				{
					gameId: "game-2",
					userId: "user-b",
					rankId: "rank-b",
					season: 6,
					kind: "reversal",
					cycle: 1,
					pointsDelta: -3,
					winsDelta: 0,
					lossesDelta: 1,
				},
			]);

			const [, params] = (dataSource.query as jest.Mock).mock.calls[0];
			expect(params).toEqual([
				"game-1",
				"user-a",
				"rank-a",
				5,
				"applied",
				0,
				3,
				1,
				0,
				"game-2",
				"user-b",
				"rank-b",
				6,
				"reversal",
				1,
				-3,
				0,
				1,
			]);
		});

		it("accounts inserted rows from RETURNING and skipped rows as the remainder of the chunk", async () => {
			(dataSource.query as jest.Mock).mockResolvedValueOnce([{ id: "row-0" }]); // 1 of 3 inserted

			const result = await repository.insertLedgerEntries(makeEntries(3));

			expect(result).toEqual({ inserted: 1, skipped: 2 });
		});

		it("runs chunks sequentially and reports per-chunk progress with cumulative totals", async () => {
			(dataSource.query as jest.Mock)
				.mockResolvedValueOnce(Array.from({ length: 1000 }, (_, index) => ({ id: `row-${index}` })))
				.mockResolvedValueOnce([{ id: "row-last" }]); // 1 of 1 inserted, second chunk

			const progressUpdates: unknown[] = [];
			const result = await repository.insertLedgerEntries(makeEntries(1001), (progress) =>
				progressUpdates.push(progress),
			);

			expect(result).toEqual({ inserted: 1001, skipped: 0 });
			expect(progressUpdates).toEqual([
				{
					chunkIndex: 1,
					totalChunks: 2,
					chunkSize: 1000,
					insertedInChunk: 1000,
					skippedInChunk: 0,
					totalInserted: 1000,
					totalSkipped: 0,
				},
				{
					chunkIndex: 2,
					totalChunks: 2,
					chunkSize: 1,
					insertedInChunk: 1,
					skippedInChunk: 0,
					totalInserted: 1001,
					totalSkipped: 0,
				},
			]);
		});
	});
});
