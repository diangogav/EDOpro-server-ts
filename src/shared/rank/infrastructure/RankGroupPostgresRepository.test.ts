import { dataSource } from "../../../evolution-types/src/data-source";
import { RankGroupPostgresRepository } from "./RankGroupPostgresRepository";

// Mocks TypeORM's `dataSource` (same pattern as RankPostgresRepository.test.ts):
// proves the exact SQL/parameter contract issued to Postgres.
jest.mock("../../../evolution-types/src/data-source", () => ({
	dataSource: {
		query: jest.fn(),
	},
}));

describe("RankGroupPostgresRepository", () => {
	let repository: RankGroupPostgresRepository;
	let query: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		query = dataSource.query as jest.Mock;
		repository = new RankGroupPostgresRepository();
	});

	describe("upsertGroup", () => {
		it("inserts a missing group with type 'group' and only_current, then re-selects it", async () => {
			query
				.mockResolvedValueOnce([]) // select by name: missing
				.mockResolvedValueOnce([]) // insert
				.mockResolvedValueOnce([{ id: "rank-1", type: "group" }]); // re-select

			const result = await repository.upsertGroup({
				name: "TCG",
				enabled: true,
				onlyCurrent: true,
			});

			expect(result).toEqual({ id: "rank-1" });
			expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("'group'"), [
				"TCG",
				true,
				true,
			]);
			expect(query.mock.calls[1][0]).toContain("ON CONFLICT (name) DO NOTHING");
			expect(query.mock.calls[1][0]).toContain("only_current");
		});

		it("updates enabled and only_current on an existing group rank", async () => {
			query
				.mockResolvedValueOnce([{ id: "rank-1", type: "group" }]) // select by name
				.mockResolvedValueOnce([[], 1]); // update

			const result = await repository.upsertGroup({
				name: "TCG",
				enabled: false,
				onlyCurrent: false,
			});

			expect(result).toEqual({ id: "rank-1" });
			expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("UPDATE ranks"), [
				"rank-1",
				false,
				false,
			]);
			expect(query.mock.calls[1][0]).toContain("type = 'group'");
		});

		it("returns null and issues no write when the name belongs to a non-group rank", async () => {
			query.mockResolvedValueOnce([{ id: "rank-1", type: "banlist" }]);

			const result = await repository.upsertGroup({
				name: "TCG",
				enabled: true,
				onlyCurrent: true,
			});

			expect(result).toBeNull();
			expect(query).toHaveBeenCalledTimes(1);
		});

		it("returns null when a concurrent writer claimed the name with another type", async () => {
			query
				.mockResolvedValueOnce([]) // select: missing
				.mockResolvedValueOnce([]) // insert conflicts silently
				.mockResolvedValueOnce([{ id: "rank-9", type: "banlist" }]); // re-select

			const result = await repository.upsertGroup({
				name: "TCG",
				enabled: true,
				onlyCurrent: true,
			});

			expect(result).toBeNull();
		});
	});

	describe("replaceMembers", () => {
		it("deletes existing members and inserts each pattern", async () => {
			query.mockResolvedValue([]);

			await repository.replaceMembers("rank-1", ["* TCG", "RD"]);

			expect(query).toHaveBeenNthCalledWith(
				1,
				expect.stringContaining("DELETE FROM rank_members"),
				["rank-1"],
			);
			expect(query).toHaveBeenNthCalledWith(
				2,
				expect.stringContaining("INSERT INTO rank_members"),
				["rank-1", "* TCG"],
			);
			expect(query).toHaveBeenNthCalledWith(
				3,
				expect.stringContaining("INSERT INTO rank_members"),
				["rank-1", "RD"],
			);
		});
	});

	describe("findGroupNames", () => {
		it("selects the names of every type 'group' rank", async () => {
			query.mockResolvedValueOnce([{ name: "TCG" }, { name: "Rush" }]);

			const names = await repository.findGroupNames();

			expect(names).toEqual(["TCG", "Rush"]);
			expect(query.mock.calls[0][0]).toContain("type = 'group'");
		});
	});
});
