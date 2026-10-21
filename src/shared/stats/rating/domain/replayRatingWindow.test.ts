import { EloCalculator } from "./EloCalculator";
import { Rating, RatingProperties } from "./Rating";
import {
	baselineAtWindowStart,
	compareReplayWithStored,
	replayRatingWindow,
	StoredWindowRow,
	validateWindowGame,
	WindowGame,
} from "./replayRatingWindow";

function game(gameId: string, winner: string, loser: string, rated = true): WindowGame {
	return {
		gameId,
		players: [
			{ userId: winner, winner: true },
			{ userId: loser, winner: false },
		],
		rated,
	};
}

describe("baselineAtWindowStart", () => {
	it("starts from the first window row's previous rating and removes the window's games", () => {
		const current: RatingProperties = { value: 1100, gamesPlayed: 15, peak: 1120 };
		const windowRows = [
			{ previousRating: 1060, delta: 20 },
			{ previousRating: 1080, delta: 20 },
		];
		const preWindowRows = [
			{ previousRating: 1000, delta: 40 },
			{ previousRating: 1040, delta: 20 },
		];

		expect(baselineAtWindowStart(current, windowRows, preWindowRows)).toEqual({
			value: 1060,
			gamesPlayed: 13,
			peak: 1060,
		});
	});

	it("keeps the initial rating as the lowest possible peak", () => {
		const current: RatingProperties = { value: 960, gamesPlayed: 2, peak: 1000 };

		expect(
			baselineAtWindowStart(
				current,
				[{ previousRating: 980, delta: -20 }],
				[{ previousRating: 1000, delta: -20 }],
			),
		).toEqual({ value: 980, gamesPlayed: 1, peak: 1000 });
	});

	it("uses the current rating untouched when the player has no window rows", () => {
		const current: RatingProperties = { value: 1234, gamesPlayed: 40, peak: 1300 };

		expect(baselineAtWindowStart(current, [], [])).toEqual(current);
	});

	it("starts a player without any rating at the initial rating", () => {
		const initial = Rating.initialize();

		expect(baselineAtWindowStart(null, [], [])).toEqual({
			value: initial.value,
			gamesPlayed: initial.gamesPlayed,
			peak: initial.peak,
		});
	});

	it("rejects window rows for a player without a stored rating", () => {
		expect(() => baselineAtWindowStart(null, [{ previousRating: 1000, delta: 40 }], [])).toThrow();
	});
});

describe("replayRatingWindow", () => {
	it("replays games in order with the live formula and returns every row and final rating", () => {
		const baselines = new Map<string, RatingProperties>([
			["a", { value: 1000, gamesPlayed: 0, peak: 1000 }],
			["b", { value: 1000, gamesPlayed: 0, peak: 1000 }],
		]);

		const { rows, finals } = replayRatingWindow(baselines, [
			game("g1", "a", "b"),
			game("g2", "a", "b"),
		]);

		expect(rows).toEqual([
			{
				gameId: "g1",
				userId: "a",
				previousRating: 1000,
				delta: 20,
				kFactor: 40,
				opponentRating: 1000,
			},
			{
				gameId: "g1",
				userId: "b",
				previousRating: 1000,
				delta: -20,
				kFactor: 40,
				opponentRating: 1000,
			},
			{
				gameId: "g2",
				userId: "a",
				previousRating: 1020,
				delta: 18,
				kFactor: 40,
				opponentRating: 980,
			},
			{
				gameId: "g2",
				userId: "b",
				previousRating: 980,
				delta: -18,
				kFactor: 40,
				opponentRating: 1020,
			},
		]);
		expect(finals.get("a")).toEqual({ value: 1038, gamesPlayed: 2, peak: 1038 });
		expect(finals.get("b")).toEqual({ value: 962, gamesPlayed: 2, peak: 1000 });
	});

	it("matches EloCalculator for a single game", () => {
		const baselines = new Map<string, RatingProperties>([
			["a", { value: 1500, gamesPlayed: 30, peak: 1500 }],
			["b", { value: 1300, gamesPlayed: 30, peak: 1400 }],
		]);
		const ratings = new Map([
			["a", Rating.from(baselines.get("a") as RatingProperties)],
			["b", Rating.from(baselines.get("b") as RatingProperties)],
		]);
		const expected = EloCalculator.deltasFor(
			[
				{ id: "a", team: 0, winner: false },
				{ id: "b", team: 1, winner: true },
			],
			ratings,
		);

		const { rows } = replayRatingWindow(baselines, [game("g1", "b", "a")]);

		expect(rows.find((row) => row.userId === "a")?.delta).toBe(expected[0].delta);
		expect(rows.find((row) => row.userId === "b")?.delta).toBe(expected[1].delta);
	});

	it("records the delta the rating floor lets through", () => {
		const baselines = new Map<string, RatingProperties>([
			["a", { value: 105, gamesPlayed: 30, peak: 1000 }],
			["b", { value: 105, gamesPlayed: 30, peak: 1000 }],
		]);

		const { rows, finals } = replayRatingWindow(baselines, [game("g1", "a", "b")]);

		expect(rows.find((row) => row.userId === "b")?.delta).toBe(-5);
		expect(finals.get("b")?.value).toBe(100);
	});

	it("starts a player missing from the baselines at the initial rating", () => {
		const baselines = new Map<string, RatingProperties>([
			["a", { value: 1000, gamesPlayed: 0, peak: 1000 }],
		]);

		const { finals } = replayRatingWindow(baselines, [game("g1", "a", "new")]);

		expect(finals.get("new")).toEqual({ value: 980, gamesPlayed: 1, peak: 1000 });
	});

	it("skips games that were not rated live", () => {
		const baselines = new Map<string, RatingProperties>([
			["a", { value: 1000, gamesPlayed: 0, peak: 1000 }],
			["b", { value: 1000, gamesPlayed: 0, peak: 1000 }],
		]);

		const { rows, finals } = replayRatingWindow(baselines, [game("g1", "a", "b", false)]);

		expect(rows).toEqual([]);
		expect(finals.get("a")).toEqual({ value: 1000, gamesPlayed: 0, peak: 1000 });
	});
});

describe("compareReplayWithStored", () => {
	const stored: StoredWindowRow[] = [
		{
			gameId: "g1",
			userId: "a",
			previousRating: 1000,
			delta: 20,
			kFactor: 40,
			opponentRating: 1000,
		},
		{
			gameId: "g1",
			userId: "b",
			previousRating: 1000,
			delta: -20,
			kFactor: 40,
			opponentRating: 1000,
		},
	];

	it("reports no mismatch when the replay reproduces the stored rows", () => {
		expect(compareReplayWithStored(stored, [...stored])).toEqual([]);
	});

	it("reports every stored row the replay does not reproduce", () => {
		const replayed = [stored[0], { ...stored[1], delta: -19 }];

		expect(compareReplayWithStored(stored, replayed)).toEqual([
			{ gameId: "g1", userId: "b", stored: stored[1], replayed: replayed[1] },
		]);
	});

	it("reports a stored row the replay never produced", () => {
		expect(compareReplayWithStored(stored, [stored[0]])).toEqual([
			{ gameId: "g1", userId: "b", stored: stored[1], replayed: null },
		]);
	});
});

describe("validateWindowGame", () => {
	it("accepts two distinct players with exactly one winner", () => {
		expect(validateWindowGame(game("g1", "a", "b"))).toBeNull();
	});

	it("rejects a game without exactly two players", () => {
		expect(
			validateWindowGame({ gameId: "g1", players: [{ userId: "a", winner: true }], rated: true }),
		).toMatch(/g1/);
	});

	it("rejects a game with the same player twice", () => {
		expect(validateWindowGame(game("g1", "a", "a"))).toMatch(/g1/);
	});

	it("rejects a game without exactly one winner", () => {
		expect(
			validateWindowGame({
				gameId: "g1",
				players: [
					{ userId: "a", winner: true },
					{ userId: "b", winner: true },
				],
				rated: true,
			}),
		).toMatch(/g1/);
	});
});
