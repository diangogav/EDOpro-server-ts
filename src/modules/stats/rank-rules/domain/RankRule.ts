export class RankRule {
	public readonly minPosition: number;
	public readonly maxPosition: number;
	public readonly scorePerWin: number;
	public readonly scorePerDefeat: number;
	public readonly bonusPerWin: number;
	public readonly punishmentPerDefeat: number;
	public readonly name: string;

	constructor({
		minPosition,
		maxPosition,
		scorePerWin,
		scorePerDefeat,
		bonusPerWin,
		punishmentPerDefeat,
		name,
	}: {
		minPosition: number;
		maxPosition: number;
		scorePerWin: number;
		scorePerDefeat: number;
		bonusPerWin: number;
		punishmentPerDefeat: number;
		name: string;
	}) {
		this.minPosition = minPosition;
		this.maxPosition = maxPosition;
		this.scorePerWin = scorePerWin;
		this.scorePerDefeat = scorePerDefeat;
		this.bonusPerWin = bonusPerWin;
		this.punishmentPerDefeat = punishmentPerDefeat;
		this.name = name;
	}

	calculatePoints(opponent: RankRule): { earned: number; lost: number } {
		return {
			earned: this.scorePerWin + this.calculateBonusPerWin(opponent),
			lost: this.scorePerDefeat + this.calculatePunishmentPerDefeat(opponent),
		};
	}

	private betterThan(rule: RankRule): boolean {
		if (rule.name === this.name) {
			return false;
		}

		return !(this.name > rule.name);
	}

	private isEqualTo(rule: RankRule): boolean {
		return this.name === rule.name;
	}

	private calculateBonusPerWin(rule: RankRule): number {
		if (this.isEqualTo(rule)) {
			return 0;
		}

		if (this.betterThan(rule)) {
			return 0;
		}

		return rule.bonusPerWin;
	}

	private calculatePunishmentPerDefeat(rule: RankRule) {
		if (this.betterThan(rule)) {
			return rule.punishmentPerDefeat;
		}

		return 0;
	}
}
