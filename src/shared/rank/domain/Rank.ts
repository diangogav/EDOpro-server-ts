export type RankType = "banlist" | "group" | "global";

export type Rank = {
	id: string;
	name: string;
	type: RankType;
	enabled: boolean;
};
