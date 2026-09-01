export type RatingProperties = {
	value: number;
	gamesPlayed: number;
	peak: number;
};

const INITIAL_RATING = 1000;
/**
 * Lowest rating a player can be projected down to. Bounding the expected-score
 * gap means a loss always costs at least one point, so a long enough losing
 * streak would otherwise walk a rating down through zero and into negatives.
 */
const RATING_FLOOR = 100;
const PROVISIONAL_GAMES_THRESHOLD = 10;

export class Rating {
	public readonly value: number;
	public readonly gamesPlayed: number;
	public readonly peak: number;

	private constructor(data: RatingProperties) {
		this.value = data.value;
		this.gamesPlayed = data.gamesPlayed;
		this.peak = data.peak;
	}

	static initialize(): Rating {
		return new Rating({ value: INITIAL_RATING, gamesPlayed: 0, peak: INITIAL_RATING });
	}

	static from(data: RatingProperties): Rating {
		return new Rating(data);
	}

	get provisional(): boolean {
		return this.gamesPlayed < PROVISIONAL_GAMES_THRESHOLD;
	}

	/**
	 * The part of `delta` this rating can actually absorb: identical to `delta`
	 * unless the floor truncates it. Callers that persist or display a delta
	 * must use this value, so that `previousRating + delta` always equals the
	 * resulting rating and a recorded delta stays exactly reversible.
	 */
	effectiveDelta(delta: number): number {
		return Math.max(RATING_FLOOR, this.value + delta) - this.value;
	}

	applyDelta(delta: number): Rating {
		const value = this.value + this.effectiveDelta(delta);

		return new Rating({
			value,
			gamesPlayed: this.gamesPlayed + 1,
			peak: Math.max(this.peak, value),
		});
	}
}
