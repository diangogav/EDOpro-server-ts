import { Rating } from "./Rating";
import { MatchRatingSnapshot } from "./MatchRatingSnapshot";

describe("MatchRatingSnapshot", () => {
	describe("create()", () => {
		it("holds the start-time ratings, banlist, and season it was built with", () => {
			const ratings = new Map<string, Rating>([
				["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
				["player-2", Rating.from({ value: 980, gamesPlayed: 15, peak: 1010 })],
			]);

			const snapshot = MatchRatingSnapshot.create(ratings, "rank-1", 5);

			expect(snapshot.rankId).toBe("rank-1");
			expect(snapshot.season).toBe(5);
			expect(snapshot.ratingFor("player-1")).toEqual(
				Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 }),
			);
			expect(snapshot.ratingFor("player-2")).toEqual(
				Rating.from({ value: 980, gamesPlayed: 15, peak: 1010 }),
			);
		});

		it("returns undefined for a player that has no start-time rating recorded", () => {
			const ratings = new Map<string, Rating>([
				["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
			]);

			const snapshot = MatchRatingSnapshot.create(ratings, "rank-1", 5);

			expect(snapshot.ratingFor("player-unknown")).toBeUndefined();
		});

		it("is immutable to mutation of the map passed at construction", () => {
			const ratings = new Map<string, Rating>([
				["player-1", Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 })],
			]);

			const snapshot = MatchRatingSnapshot.create(ratings, "rank-1", 5);
			ratings.set("player-1", Rating.initialize());
			ratings.set("player-2", Rating.initialize());

			expect(snapshot.ratingFor("player-1")).toEqual(
				Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 }),
			);
			expect(snapshot.ratingFor("player-2")).toBeUndefined();
		});
	});
});
