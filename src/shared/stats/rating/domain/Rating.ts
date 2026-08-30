export type RatingProperties = {
	value: number;
	gamesPlayed: number;
	peak: number;
};

const INITIAL_RATING = 1000;
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

	applyDelta(delta: number): Rating {
		const value = this.value + delta;

		return new Rating({
			value,
			gamesPlayed: this.gamesPlayed + 1,
			peak: Math.max(this.peak, value),
		});
	}
}
