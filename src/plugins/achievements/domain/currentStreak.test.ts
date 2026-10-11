import { currentStreak } from "./currentStreak";

describe("currentStreak", () => {
	it("is zero without matches", () => {
		expect(currentStreak([])).toBe(0);
	});

	it("is zero when the latest match is a loss", () => {
		expect(currentStreak([false, true, true])).toBe(0);
	});

	it("counts wins up to the first loss, latest first", () => {
		expect(currentStreak([true, true, false, true])).toBe(2);
	});

	it("counts every row when there is no loss", () => {
		expect(currentStreak([true, true, true])).toBe(3);
	});
});
