import { Team } from "@shared/room/Team";

import { EloCalculator } from "./EloCalculator";
import { Rating, RatingProperties } from "./Rating";

export type WindowGamePlayer = {
	userId: string;
	winner: boolean;
};

/**
 * One game of a rank's replay window, in chronological order. `rated` is
 * false for a game that never went through Elo live (a player without an
 * account), so the replay skips it exactly as the live path did.
 */
export type WindowGame = {
	gameId: string;
	players: WindowGamePlayer[];
	rated: boolean;
};

/** One `rating_history` row of the window, as stored or as replayed. */
export type StoredWindowRow = {
	gameId: string;
	userId: string;
	previousRating: number;
	delta: number;
	kFactor: number;
	opponentRating: number;
};

/** The rating movement of one history row: before value and applied delta. */
export type RatingStep = {
	previousRating: number;
	delta: number;
};

export type ReplayMismatch = {
	gameId: string;
	userId: string;
	stored: StoredWindowRow;
	replayed: StoredWindowRow | null;
};

/**
 * A player's rating right before the window opened, rebuilt from the stored
 * rating and history: the first window row holds the value the window started
 * from, every window row added one game, and the peak is the highest value
 * reached before the window (never below the initial rating). A player with
 * no window rows did not move inside it, so the stored rating is the baseline.
 */
export function baselineAtWindowStart(
	current: RatingProperties | null,
	windowRows: RatingStep[],
	preWindowRows: RatingStep[],
): RatingProperties {
	if (windowRows.length === 0) {
		return current ?? toProperties(Rating.initialize());
	}
	if (current === null) {
		throw new Error("A player with rating history inside the window must have a stored rating");
	}

	const reached = preWindowRows.flatMap((row) => [
		row.previousRating,
		row.previousRating + row.delta,
	]);

	return {
		value: windowRows[0].previousRating,
		gamesPlayed: current.gamesPlayed - windowRows.length,
		peak: Math.max(Rating.initialize().peak, ...reached),
	};
}

/**
 * Replays the window's games in order from the baselines with the live Elo
 * formula, recording the delta the rating actually absorbed (the floor can
 * truncate a loss), and returns every history row plus each player's final
 * rating. Players missing from the baselines start at the initial rating.
 */
export function replayRatingWindow(
	baselines: Map<string, RatingProperties>,
	games: WindowGame[],
): { rows: StoredWindowRow[]; finals: Map<string, RatingProperties> } {
	const state = new Map<string, Rating>(
		[...baselines].map(([userId, properties]) => [userId, Rating.from(properties)]),
	);
	const rows: StoredWindowRow[] = [];

	for (const game of games.filter((item) => item.rated)) {
		const ratings = new Map(
			game.players.map((player) => [
				player.userId,
				state.get(player.userId) ?? Rating.initialize(),
			]),
		);
		const deltas = EloCalculator.deltasFor(
			game.players.map((player, index) => ({
				id: player.userId,
				team: index === 0 ? Team.PLAYER : Team.OPPONENT,
				winner: player.winner,
			})),
			ratings,
		);

		for (const delta of deltas) {
			const rating = ratings.get(delta.userId) as Rating;
			const appliedDelta = rating.effectiveDelta(delta.delta);
			rows.push({
				gameId: game.gameId,
				userId: delta.userId,
				previousRating: delta.previousRating,
				delta: appliedDelta,
				kFactor: delta.kFactor,
				opponentRating: delta.opponentRating,
			});
			state.set(delta.userId, rating.applyDelta(appliedDelta));
		}
	}

	return {
		rows,
		finals: new Map([...state].map(([userId, rating]) => [userId, toProperties(rating)])),
	};
}

/** Stored rows the replay does not reproduce field for field. */
export function compareReplayWithStored(
	stored: StoredWindowRow[],
	replayed: StoredWindowRow[],
): ReplayMismatch[] {
	const replayedByKey = new Map(replayed.map((row) => [rowKey(row), row]));

	return stored
		.map((row) => ({ row, match: replayedByKey.get(rowKey(row)) ?? null }))
		.filter(({ row, match }) => match === null || !sameRow(row, match))
		.map(({ row, match }) => ({
			gameId: row.gameId,
			userId: row.userId,
			stored: row,
			replayed: match,
		}));
}

/**
 * Why a game cannot be replayed as a 1v1 (null when it can): exactly two
 * distinct players and exactly one winner.
 */
export function validateWindowGame(game: WindowGame): string | null {
	if (game.players.length !== 2) {
		return `Game ${game.gameId} has ${game.players.length} players, expected 2`;
	}
	if (game.players[0].userId === game.players[1].userId) {
		return `Game ${game.gameId} has the same player on both sides`;
	}
	if (game.players.filter((player) => player.winner).length !== 1) {
		return `Game ${game.gameId} does not have exactly one winner`;
	}

	return null;
}

function rowKey(row: StoredWindowRow): string {
	return `${row.gameId}:${row.userId}`;
}

function sameRow(left: StoredWindowRow, right: StoredWindowRow): boolean {
	return (
		left.previousRating === right.previousRating &&
		left.delta === right.delta &&
		left.kFactor === right.kFactor &&
		left.opponentRating === right.opponentRating
	);
}

function toProperties(rating: Rating): RatingProperties {
	return { value: rating.value, gamesPlayed: rating.gamesPlayed, peak: rating.peak };
}
