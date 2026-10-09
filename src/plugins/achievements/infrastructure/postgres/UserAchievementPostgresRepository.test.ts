import { dataSource } from "../../../../evolution-types/src/data-source";
import {
	USER_ACHIEVEMENTS_LOCK_QUERY,
	UserAchievementPostgresRepository,
} from "./UserAchievementPostgresRepository";

jest.mock("../../../../evolution-types/src/data-source", () => ({
	dataSource: { transaction: jest.fn() },
}));

describe("UserAchievementPostgresRepository", () => {
	it("takes the per-user advisory lock inside the transaction before any other query", async () => {
		const queries: string[] = [];
		const manager = {
			query: jest.fn(async (sql: string) => {
				queries.push(sql);

				return [];
			}),
		};
		(dataSource.transaction as jest.Mock).mockImplementation(
			async (work: (m: typeof manager) => Promise<unknown>) => work(manager),
		);

		await new UserAchievementPostgresRepository().transaction("user-1", async (tx) => {
			await tx.heldAchievementIds("user-1", [1001]);
			await tx.award({ userId: "user-1", achievementId: 1001, season: 1, labels: [] });
		});

		expect(queries[0]).toBe(USER_ACHIEVEMENTS_LOCK_QUERY);
		expect(manager.query).toHaveBeenNthCalledWith(1, USER_ACHIEVEMENTS_LOCK_QUERY, ["user-1"]);
		expect(queries[1]).toContain("SELECT DISTINCT achievement_id");
		expect(queries[2]).toContain("INSERT INTO user_achievements");
	});
});
