import { RankRule } from "../domain/RankRule";
import { RankRuleRepository } from "../domain/RankRuleRepository";

export class RankRuleMemoryRepository implements RankRuleRepository {
	private readonly rules = [
		new RankRule({
			name: "A",
			minPosition: 1,
			maxPosition: 10,
			scorePerWin: 1,
			scorePerDefeat: 10,
			bonusPerWin: 10,
			punishmentPerDefeat: 1,
		}),
		new RankRule({
			name: "B",
			minPosition: 11,
			maxPosition: 20,
			scorePerWin: 2,
			scorePerDefeat: 9,
			bonusPerWin: 9,
			punishmentPerDefeat: 2,
		}),
		new RankRule({
			name: "C",
			minPosition: 21,
			maxPosition: 30,
			scorePerWin: 3,
			scorePerDefeat: 8,
			bonusPerWin: 8,
			punishmentPerDefeat: 3,
		}),
		new RankRule({
			name: "D",
			minPosition: 31,
			maxPosition: 40,
			scorePerWin: 4,
			scorePerDefeat: 7,
			bonusPerWin: 7,
			punishmentPerDefeat: 4,
		}),
		new RankRule({
			name: "E",
			minPosition: 41,
			maxPosition: 50,
			scorePerWin: 5,
			scorePerDefeat: 6,
			bonusPerWin: 6,
			punishmentPerDefeat: 5,
		}),
		new RankRule({
			name: "F",
			minPosition: 51,
			maxPosition: 60,
			scorePerWin: 6,
			scorePerDefeat: 5,
			bonusPerWin: 5,
			punishmentPerDefeat: 6,
		}),
		new RankRule({
			name: "E",
			minPosition: 61,
			maxPosition: 70,
			scorePerWin: 7,
			scorePerDefeat: 4,
			bonusPerWin: 4,
			punishmentPerDefeat: 7,
		}),
		new RankRule({
			name: "H",
			minPosition: 71,
			maxPosition: 80,
			scorePerWin: 8,
			scorePerDefeat: 3,
			bonusPerWin: 3,
			punishmentPerDefeat: 8,
		}),
		new RankRule({
			name: "I",
			minPosition: 81,
			maxPosition: 90,
			scorePerWin: 9,
			scorePerDefeat: 2,
			bonusPerWin: 2,
			punishmentPerDefeat: 9,
		}),
		new RankRule({
			name: "J",
			minPosition: 91,
			maxPosition: Number.POSITIVE_INFINITY,
			scorePerWin: 10,
			scorePerDefeat: 1,
			bonusPerWin: 1,
			punishmentPerDefeat: 10,
		}),
	];

	async get(): Promise<RankRule[]> {
		return Promise.resolve(this.rules);
	}

	async findByRankPosition(rankPosition: number): Promise<RankRule> {
		const rule = this.rules.find(
			(rule) => rankPosition >= rule.minPosition && rankPosition <= rule.maxPosition
		);

		if (!rule) {
			return Promise.resolve(this.rules.find((rule) => rule.name === "J") as RankRule);
		}

		return Promise.resolve(rule);
	}

	async findByName(name: string): Promise<RankRule> {
		const rule = this.rules.find((rule) => rule.name === name);

		if (!rule) {
			return Promise.resolve(this.rules.find((rule) => rule.name === "J") as RankRule);
		}

		return Promise.resolve(rule);
	}
}
