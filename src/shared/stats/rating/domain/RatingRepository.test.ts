import { mock } from "jest-mock-extended";

import { Rating } from "./Rating";
import { RatingRepository } from "./RatingRepository";

describe("RatingRepository — findMany port contract", () => {
	it("exposes findMany(userIds, rankId, season) returning a Promise<Map<string, Rating>>", async () => {
		const repository = mock<RatingRepository>();
		const ratings = new Map<string, Rating>([
			["player-1", Rating.from({ value: 1050, gamesPlayed: 12, peak: 1080 })],
		]);
		repository.findMany.mockResolvedValue(ratings);

		const result = await repository.findMany(["player-1"], "rank-1", 5);

		expect(repository.findMany).toHaveBeenCalledWith(["player-1"], "rank-1", 5);
		expect(result).toBe(ratings);
	});
});
