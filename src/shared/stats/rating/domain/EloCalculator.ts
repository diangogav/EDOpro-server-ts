import { Team } from "@shared/room/Team";

import { Rating } from "./Rating";

const RATING_SCALE = 400;
/**
 * Upper bound on the rating gap fed into the expected score. The Elo curve
 * itself degrades gracefully at any gap; integer rounding does not. Deltas are
 * rounded to whole points, so past roughly 640 points of gap the underdog's
 * loss rounds to exactly 0 and the favourite's win pays exactly 0: losing
 * becomes free for the weaker player and beating a newcomer becomes worthless
 * to the stronger one, who can still drop 20 by slipping. Bounding the gap at
 * 500 keeps every K tier — including K=10 above 2300, where a 600 bound
 * already rounds a win down to 0 — paying at least one point in both
 * directions. Gaps under the bound are untouched, so ordinary matchups score
 * exactly as before.
 */
const MAX_EXPECTED_SCORE_GAP = 500;
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
		const gap = Math.min(
			MAX_EXPECTED_SCORE_GAP,
			Math.max(-MAX_EXPECTED_SCORE_GAP, opponentRating - playerRating),
		);

		return 1 / (1 + 10 ** (gap / RATING_SCALE));
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
