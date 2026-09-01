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

		it("stops the value at the 100 floor instead of dropping below it", () => {
			const rating = Rating.from({ value: 105, gamesPlayed: 40, peak: 1200 });

			const updated = rating.applyDelta(-20);

			expect(updated.value).toBe(100);
			expect(updated.gamesPlayed).toBe(41);
		});

		it("still counts the game and leaves peak untouched when the floor truncates the loss", () => {
			const rating = Rating.from({ value: 105, gamesPlayed: 40, peak: 1200 });

			const updated = rating.applyDelta(-900);

			expect(updated.value).toBe(100);
			expect(updated.gamesPlayed).toBe(41);
			expect(updated.peak).toBe(1200);
		});

		it("keeps raising peak normally once a floored rating climbs again", () => {
			const floored = Rating.from({ value: 100, gamesPlayed: 60, peak: 1200 });

			expect(floored.applyDelta(40).peak).toBe(1200);
			expect(Rating.from({ value: 100, gamesPlayed: 60, peak: 100 }).applyDelta(40).peak).toBe(140);
		});

		it("bottoms out at the floor over a long losing streak instead of going negative", () => {
			let rating = Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 });

			for (let game = 0; game < 500; game++) {
				rating = rating.applyDelta(-20);
				expect(rating.value).toBeGreaterThanOrEqual(100);
			}

			expect(rating.value).toBe(100);
			expect(rating.gamesPlayed).toBe(520);
			expect(rating.peak).toBe(1000);
		});
	});

	describe("effectiveDelta()", () => {
		it("returns the delta untouched while the floor does not bind", () => {
			const rating = Rating.from({ value: 1000, gamesPlayed: 20, peak: 1000 });

			expect(rating.effectiveDelta(-20)).toBe(-20);
			expect(rating.effectiveDelta(20)).toBe(20);
			expect(rating.effectiveDelta(-900)).toBe(-900);
		});

		it("truncates a loss to the distance left above the floor", () => {
			const rating = Rating.from({ value: 105, gamesPlayed: 40, peak: 1200 });

			expect(rating.effectiveDelta(-20)).toBe(-5);
			expect(Rating.from({ value: 100, gamesPlayed: 40, peak: 1200 }).effectiveDelta(-20)).toBe(0);
		});

		it("always reconciles: previous value plus the effective delta is the applied value", () => {
			for (const value of [1000, 140, 120, 105, 100]) {
				const rating = Rating.from({ value, gamesPlayed: 40, peak: 1200 });

				for (const delta of [-40, -20, -1, 0, 20]) {
					expect(rating.value + rating.effectiveDelta(delta)).toBe(rating.applyDelta(delta).value);
				}
			}
		});
	});
});
