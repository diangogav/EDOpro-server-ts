import { RankRuleRepository } from "../../../src/modules/stats/by-rank-rule/rank-rules/domain/RankRuleRepository";
import { RankRuleMemoryRepository } from "../../../src/modules/stats/by-rank-rule/rank-rules/infrastructure/RankRuleMemoryRepository";

describe("Rank Rule", () => {
	const rankRuleRepository: RankRuleRepository = new RankRuleMemoryRepository();

	it("Should not add bonus points for equal rule rank and not punish for defeat", async () => {
		const playerRankRule = await rankRuleRepository.findByName("A");
		const opponentRankRule = await rankRuleRepository.findByName("A");
		const points = playerRankRule.calculatePoints(opponentRankRule);
		expect(points.earned).toBe(playerRankRule.scorePerWin);
		expect(points.lost).toBe(playerRankRule.scorePerDefeat);
	});

	it("Should not add bonus points for better rule rank; but should punish for defeat", async () => {
		const playerRankRule = await rankRuleRepository.findByName("A");
		const opponentRankRule = await rankRuleRepository.findByName("B");
		const points = playerRankRule.calculatePoints(opponentRankRule);
		expect(points.earned).toBe(playerRankRule.scorePerWin);
		expect(points.lost).toBe(playerRankRule.scorePerDefeat + opponentRankRule.punishmentPerDefeat);
	});

	it("Should add bonus points for not better rule rank; but not should punish for defeat", async () => {
		const playerRankRule = await rankRuleRepository.findByName("B");
		const opponentRankRule = await rankRuleRepository.findByName("A");
		const points = playerRankRule.calculatePoints(opponentRankRule);
		expect(points.earned).toBe(playerRankRule.scorePerWin + opponentRankRule.bonusPerWin);
		expect(points.lost).toBe(playerRankRule.scorePerDefeat);
	});
});
