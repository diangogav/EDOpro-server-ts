import { RankPostgresRepository } from "./RankPostgresRepository";
import { dataSource } from "../../../evolution-types/src/data-source";

// Mocks TypeORM's `dataSource` (same pattern as
// `RatingPostgresRepository.test.ts`): proves the exact SQL/parameter
// contract issued to Postgres — the concurrency-safe
// INSERT ... ON CONFLICT (name) DO NOTHING + SELECT sequence — not that
// Postgres enforces the UNIQUE(name) constraint itself.
jest.mock("../../../evolution-types/src/data-source", () => ({
	dataSource: {
		query: jest.fn(),
	},
}));

describe("RankPostgresRepository", () => {
	let repository: RankPostgresRepository;
	let query: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		query = dataSource.query as jest.Mock;
		repository = new RankPostgresRepository();
	});

	it("inserts with ON CONFLICT (name) DO NOTHING and then selects the row by name", async () => {
		query
			.mockResolvedValueOnce([]) // insert
			.mockResolvedValueOnce([{ id: "rank-1", name: "TCG", type: "banlist", enabled: true }]);

		const rank = await repository.findOrCreateByName("TCG");

		expect(query).toHaveBeenCalledTimes(2);
		expect(query).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("ON CONFLICT (name) DO NOTHING"),
			["TCG", "banlist", true],
		);
		expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("WHERE name = $1"), ["TCG"]);
		expect(rank).toEqual({ id: "rank-1", name: "TCG", type: "banlist", enabled: true });
	});

	it("returns the already-existing rank when the insert conflicts (concurrent creation)", async () => {
		query
			.mockResolvedValueOnce([]) // insert was a conflict no-op
			.mockResolvedValueOnce([{ id: "rank-9", name: "TCG", type: "banlist", enabled: false }]);

		const rank = await repository.findOrCreateByName("TCG");

		expect(rank).toEqual({ id: "rank-9", name: "TCG", type: "banlist", enabled: false });
	});

	it('creates the literal "Global" name with type "global"', async () => {
		query
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: "rank-g", name: "Global", type: "global", enabled: true }]);

		const rank = await repository.findOrCreateByName("Global");

		expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO ranks"), [
			"Global",
			"global",
			true,
		]);
		expect(rank.type).toBe("global");
	});

	it('creates the literal "N/A" name disabled — it is not a real ladder for listings', async () => {
		query
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: "rank-na", name: "N/A", type: "banlist", enabled: false }]);

		const rank = await repository.findOrCreateByName("N/A");

		expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO ranks"), [
			"N/A",
			"banlist",
			false,
		]);
		expect(rank.enabled).toBe(false);
	});

	it('leaves an already-existing "N/A" row untouched instead of flipping its flags', async () => {
		query
			.mockResolvedValueOnce([]) // insert was a conflict no-op
			.mockResolvedValueOnce([{ id: "rank-na", name: "N/A", type: "banlist", enabled: true }]);

		const rank = await repository.findOrCreateByName("N/A");

		expect(query).toHaveBeenCalledTimes(2);
		expect(query).toHaveBeenNthCalledWith(
			1,
			expect.stringContaining("ON CONFLICT (name) DO NOTHING"),
			["N/A", "banlist", false],
		);
		expect(rank).toEqual({ id: "rank-na", name: "N/A", type: "banlist", enabled: true });
	});

	it("honors an explicitly passed type over the name-based default", async () => {
		query
			.mockResolvedValueOnce([])
			.mockResolvedValueOnce([{ id: "rank-2", name: "Custom", type: "global", enabled: true }]);

		await repository.findOrCreateByName("Custom", "global");

		expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("INSERT INTO ranks"), [
			"Custom",
			"global",
			true,
		]);
	});

	it("throws when the rank can neither be created nor found", async () => {
		query.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

		await expect(repository.findOrCreateByName("TCG")).rejects.toThrow(
			'Rank "TCG" could not be found or created',
		);
	});
});
