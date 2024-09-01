import { RankRule } from "./RankRule";

export interface RankRuleRepository {
	get(): Promise<RankRule[]>;
	findByRankPosition(rankPosition: number): Promise<RankRule>;
	findByName(name: string): Promise<RankRule>;
}
