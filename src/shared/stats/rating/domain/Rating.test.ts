import { Rating } from "./Rating";

describe("Rating", () => {
	describe("initialize()", () => {
		it("starts a new season rating at 1000 with zero games and peak 1000", () => {
			const rating = Rating.initialize();

			expect(rating.value).toBe(1000);
			expect(rating.gamesPlayed).toBe(0);
			expect(rating.peak).toBe(1000);
		});
	});

	describe("from()", () => {
		it("reconstructs a rating from persisted values", () => {
			const rating = Rating.from({ value: 1450, gamesPlayed: 12, peak: 1500 });

			expect(rating.value).toBe(1450);
			expect(rating.gamesPlayed).toBe(12);
			expect(rating.peak).toBe(1500);
		});
	});

	describe("provisional", () => {
		it("is provisional below the 10-game boundary", () => {
			const rating = Rating.from({ value: 1050, gamesPlayed: 9, peak: 1050 });

			expect(rating.provisional).toBe(true);
		});

		it("is no longer provisional at exactly 10 games", () => {
			const rating = Rating.from({ value: 1050, gamesPlayed: 10, peak: 1050 });

			expect(rating.provisional).toBe(false);
		});
	});

	describe("applyDelta()", () => {
		it("increases the value and games played, raising peak when the new value is a new high", () => {
			const rating = Rating.from({ value: 1000, gamesPlayed: 0, peak: 1000 });

			const updated = rating.applyDelta(40);

			expect(updated.value).toBe(1040);
			expect(updated.gamesPlayed).toBe(1);
			expect(updated.peak).toBe(1040);
		});

		it("keeps peak at its running maximum when a delta lowers the value", () => {
			const rating = Rating.from({ value: 1500, gamesPlayed: 20, peak: 1500 });

			const updated = rating.applyDelta(-30);

			expect(updated.value).toBe(1470);
			expect(updated.gamesPlayed).toBe(21);
			expect(updated.peak).toBe(1500);
		});
	});
});
