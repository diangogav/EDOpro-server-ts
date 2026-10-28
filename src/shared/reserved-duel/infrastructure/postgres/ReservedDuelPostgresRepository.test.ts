import { dataSource } from "src/evolution-types/src/data-source";

import { ReservedDuelPostgresRepository } from "./ReservedDuelPostgresRepository";

// Mocks TypeORM's `dataSource`: proves the SQL/parameter contract issued to
// Postgres, not that Postgres applies it.
jest.mock("src/evolution-types/src/data-source", () => ({
	dataSource: {
		query: jest.fn(),
		createQueryRunner: jest.fn(),
		transaction: jest.fn(),
	},
}));

const ID = "Ab3dEf6hIj9kLm2n";

describe("ReservedDuelPostgresRepository", () => {
	let runnerQuery: jest.Mock;

	beforeEach(() => {
		jest.clearAllMocks();
		runnerQuery = jest.fn().mockResolvedValue({ affected: 1 });
		(dataSource.createQueryRunner as jest.Mock).mockReturnValue({
			query: runnerQuery,
			release: jest.fn().mockResolvedValue(undefined),
		});
	});

	it("marks a duel started only while its row is still open", async () => {
		await new ReservedDuelPostgresRepository().markStarted(ID, "match-1");

		const [sql, parameters] = runnerQuery.mock.calls[0];
		expect(sql).toContain('"started_at" IS NULL');
		expect(sql).toContain('"ended_at" IS NULL');
		expect(parameters).toEqual([ID, "match-1"]);
	});

	it("stamps the start on an abandon that happened after the duel started", async () => {
		const recorded = await new ReservedDuelPostgresRepository().recordAbandon(ID, {
			seat: 0,
			reason: "disconnect",
			started: true,
		});

		const [sql, parameters] = runnerQuery.mock.calls[0];
		expect(sql).toContain('COALESCE("started_at", now())');
		expect(sql).toContain('"ended_at" IS NULL');
		expect(parameters).toEqual([ID, 0, "disconnect", true]);
		expect(recorded).toBe(true);
	});

	it("leaves the start empty on an abandon before the duel started", async () => {
		await new ReservedDuelPostgresRepository().recordAbandon(ID, {
			seat: null,
			reason: "no_show",
		});

		expect(runnerQuery.mock.calls[0][1]).toEqual([ID, null, "no_show", false]);
	});

	it("stamps the start on a result, since the guarded start write may arrive after it", async () => {
		await new ReservedDuelPostgresRepository().recordResult(ID, {
			outcome: "decided",
			winnerSeat: 0,
			reason: "lp",
			matchId: "match-1",
			duels: [],
		});

		expect(runnerQuery.mock.calls[0][0]).toContain('"started_at" = COALESCE("started_at", now())');
	});

	it("tells whether the reservation's row exists", async () => {
		(dataSource.query as jest.Mock).mockResolvedValueOnce([{ exists: true }]);

		expect(await new ReservedDuelPostgresRepository().exists(ID)).toBe(true);
		expect(dataSource.query).toHaveBeenCalledWith(
			expect.stringContaining('FROM "reserved_duels" WHERE "reservation_id" = $1'),
			[ID],
		);
	});

	it("reports a missing row as absent", async () => {
		(dataSource.query as jest.Mock).mockResolvedValueOnce([]);

		expect(await new ReservedDuelPostgresRepository().exists(ID)).toBe(false);
	});
});
