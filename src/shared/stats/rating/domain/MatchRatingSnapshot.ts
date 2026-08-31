import { Rating } from "./Rating";

export class MatchRatingSnapshot {
	private readonly ratings: ReadonlyMap<string, Rating>;
	public readonly banListName: string;
	public readonly season: number;

	private constructor(ratings: ReadonlyMap<string, Rating>, banListName: string, season: number) {
		this.ratings = ratings;
		this.banListName = banListName;
		this.season = season;
	}

	static create(
		ratings: ReadonlyMap<string, Rating>,
		banListName: string,
		season: number,
	): MatchRatingSnapshot {
		return new MatchRatingSnapshot(new Map(ratings), banListName, season);
	}

	ratingFor(userId: string): Rating | undefined {
		return this.ratings.get(userId);
	}
}
