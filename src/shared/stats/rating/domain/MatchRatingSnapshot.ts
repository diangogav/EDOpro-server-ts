import { Rating } from "./Rating";

export class MatchRatingSnapshot {
	private readonly ratings: ReadonlyMap<string, Rating>;
	public readonly rankId: string;
	public readonly season: number;

	private constructor(ratings: ReadonlyMap<string, Rating>, rankId: string, season: number) {
		this.ratings = ratings;
		this.rankId = rankId;
		this.season = season;
	}

	static create(
		ratings: ReadonlyMap<string, Rating>,
		rankId: string,
		season: number,
	): MatchRatingSnapshot {
		return new MatchRatingSnapshot(new Map(ratings), rankId, season);
	}

	ratingFor(userId: string): Rating | undefined {
		return this.ratings.get(userId);
	}
}
