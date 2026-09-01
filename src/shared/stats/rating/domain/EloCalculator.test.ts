import { Team } from "@shared/room/Team";

import { EloCalculator } from "./EloCalculator";
import { Rating } from "./Rating";

describe("EloCalculator", () => {
	describe("expectedScore()", () => {
		it("returns 0.5 for both players when ratings are equal", () => {
			expect(EloCalculator.expectedScore(1000, 1000)).toBeCloseTo(0.5);
			expect(EloCalculator.expectedScore(1000, 1000)).toBeCloseTo(0.5);
		});

		it("favors the higher-rated player", () => {
			const higher = EloCalculator.expectedScore(1400, 1000);
			const lower = EloCalculator.expectedScore(1000, 1400);

			expect(higher).toBeGreaterThan(0.5);
			expect(lower).toBeLessThan(0.5);
			expect(higher + lower).toBeCloseTo(1);
		});

		it("leaves the curve untouched for gaps under the 500-point bound", () => {
			for (const gap of [0, 100, 400, 499]) {
				const raw = 1 / (1 + 10 ** (-gap / 400));

				expect(EloCalculator.expectedScore(1000 + gap, 1000)).toBeCloseTo(raw, 10);
			}
		});

		it("caps the gap at 500 points, so wider gaps all score as a 500-point gap", () => {
			const atBound = EloCalculator.expectedScore(1500, 1000);

			expect(EloCalculator.expectedScore(1600, 1000)).toBeCloseTo(atBound, 10);
			expect(EloCalculator.expectedScore(4000, 1000)).toBeCloseTo(atBound, 10);
			expect(EloCalculator.expectedScore(1000, 4000)).toBeCloseTo(1 - atBound, 10);
		});

		it("stays symmetric beyond the bound", () => {
			const higher = EloCalculator.expectedScore(3000, 1000);
			const lower = EloCalculator.expectedScore(1000, 3000);

			expect(higher + lower).toBeCloseTo(1, 10);
		});
	});

	describe("kFactorFor()", () => {
		it("uses K=40 for a provisional player regardless of rating", () => {
			const rating = Rating.from({ value: 1050, gamesPlayed: 3, peak: 1050 });

			expect(EloCalculator.kFactorFor(rating)).toBe(40);
		});

		it("uses K=10 for a non-provisional player at or above 2300, regardless of match count", () => {
			const rating = Rating.from({ value: 2310, gamesPlayed: 20, peak: 2310 });

			expect(EloCalculator.kFactorFor(rating)).toBe(10);
		});

		it("uses K=20 for a non-provisional player below 2300", () => {
			const rating = Rating.from({ value: 1800, gamesPlayed: 20, peak: 1800 });

			expect(EloCalculator.kFactorFor(rating)).toBe(20);
		});
	});

	describe("deltasFor() — 1v1", () => {
		it("applies a K-scaled delta to the winner and the loser using each other's rating", () => {
			const players = [
				{ id: "winner-1", team: Team.PLAYER, winner: true },
				{ id: "loser-1", team: Team.OPPONENT, winner: false },
			];
			const ratings = new Map([
				["winner-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
				["loser-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
			]);

			const deltas = EloCalculator.deltasFor(players, ratings);

			const winnerDelta = deltas.find((d) => d.userId === "winner-1");
			const loserDelta = deltas.find((d) => d.userId === "loser-1");

			expect(winnerDelta).toMatchObject({
				previousRating: 1000,
				delta: 10,
				kFactor: 20,
				opponentRating: 1000,
			});
			expect(loserDelta).toMatchObject({
				previousRating: 1000,
				delta: -10,
				kFactor: 20,
				opponentRating: 1000,
			});
		});
	});

	describe("deltasFor() — 2v2", () => {
		it("uses the opposing team's average rating as the expected-score opponent", () => {
			const players = [
				{ id: "p1", team: Team.PLAYER, winner: true },
				{ id: "p2", team: Team.PLAYER, winner: true },
				{ id: "o1", team: Team.OPPONENT, winner: false },
				{ id: "o2", team: Team.OPPONENT, winner: false },
			];
			const ratings = new Map([
				["p1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
				["p2", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
				["o1", Rating.from({ value: 1100, gamesPlayed: 20, peak: 1100 })],
				["o2", Rating.from({ value: 900, gamesPlayed: 20, peak: 900 })],
			]);

			const deltas = EloCalculator.deltasFor(players, ratings);

			const p1Delta = deltas.find((d) => d.userId === "p1");
			const o1Delta = deltas.find((d) => d.userId === "o1");

			// Opposing team average for p1/p2 is (1100+900)/2 = 1000 → same as 1v1 at equal rating.
			expect(p1Delta).toMatchObject({ opponentRating: 1000, delta: 10 });
			// Opposing team average for o1/o2 is (1000+1000)/2 = 1000; o1 (rated 1100) was
			// favored to win against that average and lost, so it loses more than 10.
			expect(o1Delta).toMatchObject({ opponentRating: 1000, delta: -13 });
		});
	});

	describe("deltasFor() — bounded gap", () => {
		// Each pair sits in a single K tier on both sides, so the asserted
		// minimum is unambiguous: provisional (K=40), established under 2300
		// (K=20), and established at or above 2300 (K=10), which is the tier
		// an unbounded gap silences first.
		const tiers = [
			{ name: "K=40 (provisional)", favorite: 4000, underdog: 1000, gamesPlayed: 3 },
			{ name: "K=20 (established)", favorite: 2000, underdog: 1000, gamesPlayed: 20 },
			{ name: "K=10 (high rated)", favorite: 3300, underdog: 2300, gamesPlayed: 20 },
		];

		it.each(
			tiers,
		)("$name — the favorite still gains and the underdog still pays across a huge gap", ({
			favorite,
			underdog,
			gamesPlayed,
		}) => {
			const players = [
				{ id: "favorite", team: Team.PLAYER, winner: true },
				{ id: "underdog", team: Team.OPPONENT, winner: false },
			];
			const ratings = new Map([
				["favorite", Rating.from({ value: favorite, gamesPlayed, peak: favorite })],
				["underdog", Rating.from({ value: underdog, gamesPlayed, peak: underdog })],
			]);

			const deltas = EloCalculator.deltasFor(players, ratings);

			expect(deltas.find((d) => d.userId === "favorite")?.delta).toBeGreaterThanOrEqual(1);
			expect(deltas.find((d) => d.userId === "underdog")?.delta).toBeLessThanOrEqual(-1);
		});

		it("makes a long losing streak settle on the rating floor rather than drifting free", () => {
			let player = Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 });
			const opponent = Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 });
			const players = [
				{ id: "player", team: Team.PLAYER, winner: false },
				{ id: "opponent", team: Team.OPPONENT, winner: true },
			];

			for (let game = 0; game < 800; game++) {
				const deltas = EloCalculator.deltasFor(
					players,
					new Map([
						["player", player],
						["opponent", opponent],
					]),
				);
				const playerDelta = deltas.find((d) => d.userId === "player")?.delta as number;

				expect(playerDelta).toBeLessThanOrEqual(-1);
				player = player.applyDelta(playerDelta);
				expect(player.value).toBeGreaterThanOrEqual(100);
			}

			expect(player.value).toBe(100);
		});
	});

	describe("deltasFor() — rounding drift (D8)", () => {
		it("computes each player's delta from its own K factor, so a mismatched K (e.g. one provisional) breaks zero-sum symmetry", () => {
			const players = [
				{ id: "winner-1", team: Team.PLAYER, winner: true },
				{ id: "loser-1", team: Team.OPPONENT, winner: false },
			];
			const ratings = new Map([
				["winner-1", Rating.from({ value: 1000, gamesPlayed: 3, peak: 1000 })], // provisional, K=40
				["loser-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })], // established, K=20
			]);

			const deltas = EloCalculator.deltasFor(players, ratings);
			const winnerDelta = deltas.find((d) => d.userId === "winner-1")?.delta;
			const loserDelta = deltas.find((d) => d.userId === "loser-1")?.delta;

			expect(winnerDelta).toBe(20);
			expect(loserDelta).toBe(-10);
			expect((winnerDelta as number) + (loserDelta as number)).not.toBe(0);
		});
	});
});
