import { Team } from "@shared/room/Team";

import { Rating } from "./Rating";

const RATING_SCALE = 400;
const HIGH_RATED_THRESHOLD = 2300;

const K_PROVISIONAL = 40;
const K_HIGH_RATED = 10;
const K_DEFAULT = 20;

export type RatedPlayer = {
	id: string;
	team: Team;
	winner: boolean;
};

export type RatingDelta = {
	userId: string;
	previousRating: number;
	delta: number;
	kFactor: number;
	opponentRating: number;
};

export class EloCalculator {
	static expectedScore(playerRating: number, opponentRating: number): number {
		return 1 / (1 + 10 ** ((opponentRating - playerRating) / RATING_SCALE));
	}

	static kFactorFor(rating: Rating): number {
		if (rating.provisional) {
			return K_PROVISIONAL;
		}
		if (rating.value >= HIGH_RATED_THRESHOLD) {
			return K_HIGH_RATED;
		}

		return K_DEFAULT;
	}

	static deltasFor(players: RatedPlayer[], ratings: Map<string, Rating>): RatingDelta[] {
		return players.map((player) => {
			const rating = ratings.get(player.id);
			if (!rating) {
				throw new Error(`No rating provided for player ${player.id}`);
			}

			const opponents = players.filter((other) => other.team !== player.team);
			const opponentAverage = this.averageRatingOf(opponents, ratings);
			const expected = this.expectedScore(rating.value, opponentAverage);
			const actual = player.winner ? 1 : 0;
			const kFactor = this.kFactorFor(rating);

			return {
				userId: player.id,
				previousRating: rating.value,
				delta: Math.round(kFactor * (actual - expected)),
				kFactor,
				opponentRating: Math.round(opponentAverage),
			};
		});
	}

	private static averageRatingOf(players: RatedPlayer[], ratings: Map<string, Rating>): number {
		const total = players.reduce((sum, player) => {
			const rating = ratings.get(player.id);
			if (!rating) {
				throw new Error(`No rating provided for player ${player.id}`);
			}

			return sum + rating.value;
		}, 0);

		return total / players.length;
	}
}
