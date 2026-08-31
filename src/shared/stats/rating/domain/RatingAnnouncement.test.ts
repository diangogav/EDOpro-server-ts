import { MAX_LENGTH, formatEnd, formatStart } from "./RatingAnnouncement";

describe("RatingAnnouncement", () => {
	describe("formatStart", () => {
		it("formats a 1v1 start frame with the versioned prefix and pipe-separated teams", () => {
			const frame = formatStart([
				[{ name: "Diango", rating: 1000 }],
				[{ name: "Rival", rating: 980 }],
			]);

			expect(frame).toBe("[Rating v1 start] Diango 1000 | Rival 980");
		});

		it("formats a 2v2 start frame with middle-dot separated teammates in seat order", () => {
			const frame = formatStart([
				[
					{ name: "Diango", rating: 1000 },
					{ name: "Ally", rating: 1100 },
				],
				[
					{ name: "Rival", rating: 980 },
					{ name: "Foe", rating: 1200 },
				],
			]);

			expect(frame).toBe("[Rating v1 start] Diango 1000 · Ally 1100 | Rival 980 · Foe 1200");
		});

		it("sanitizes control characters and grammar separators out of a nickname", () => {
			const frame = formatStart([
				[{ name: "Di\u0000an\u001fgo · | bad", rating: 1000 }],
				[{ name: "Rival", rating: 980 }],
			]);

			expect(frame).toBe("[Rating v1 start] Diango bad 1000 | Rival 980");
		});

		it("collapses internal whitespace runs left after sanitizing and trims the result", () => {
			const frame = formatStart([
				[{ name: "  Di   ango  ", rating: 1000 }],
				[{ name: "Rival", rating: 980 }],
			]);

			expect(frame).toBe("[Rating v1 start] Di ango 1000 | Rival 980");
		});

		it("truncates a name over MAX_LENGTH UTF-16 units and appends an ellipsis", () => {
			const longName = "A".repeat(MAX_LENGTH + 5);

			const frame = formatStart([
				[{ name: longName, rating: 1000 }],
				[{ name: "Rival", rating: 980 }],
			]);

			expect(frame).toBe(`[Rating v1 start] ${"A".repeat(MAX_LENGTH)}… 1000 | Rival 980`);
		});

		it("leaves a name exactly at MAX_LENGTH untouched — no truncation, no ellipsis", () => {
			const exactName = "B".repeat(MAX_LENGTH);

			const frame = formatStart([
				[{ name: exactName, rating: 1000 }],
				[{ name: "Rival", rating: 980 }],
			]);

			expect(frame).toBe(`[Rating v1 start] ${exactName} 1000 | Rival 980`);
		});

		it("never splits a surrogate pair when the truncation boundary lands mid-pair", () => {
			// 19 "A"s (ASCII, 1 UTF-16 unit each) then one astral emoji (2 UTF-16
			// units, a surrogate pair) whose high surrogate lands exactly at
			// index MAX_LENGTH - 1, the truncation boundary.
			const nameWithSurrogatePair = `${"A".repeat(MAX_LENGTH - 1)}\u{1F600}extra`;

			const frame = formatStart([
				[{ name: nameWithSurrogatePair, rating: 1000 }],
				[{ name: "Rival", rating: 980 }],
			]);

			const entry = frame.split(" | ")[0].replace("[Rating v1 start] ", "");
			const truncatedName = entry.slice(0, entry.lastIndexOf(" "));

			expect(truncatedName).toBe(`${"A".repeat(MAX_LENGTH - 1)}…`);
			// Well-formed UTF-16: a high surrogate is always immediately followed
			// by its low surrogate, never truncated to a lone unit.
			for (let i = 0; i < truncatedName.length; i++) {
				const code = truncatedName.charCodeAt(i);
				const isHighSurrogate = code >= 0xd800 && code <= 0xdbff;
				if (isHighSurrogate) {
					const next = truncatedName.charCodeAt(i + 1);
					expect(next).toBeGreaterThanOrEqual(0xdc00);
					expect(next).toBeLessThanOrEqual(0xdfff);
				}
			}
		});
	});

	describe("formatEnd", () => {
		it("formats a 1v1 end frame with resulting rating and signed delta per entry", () => {
			const frame = formatEnd([
				[{ name: "Diango", rating: 1012, delta: 12 }],
				[{ name: "Rival", rating: 968, delta: -12 }],
			]);

			expect(frame).toBe("[Rating v1 end] Diango 1012 (+12) | Rival 968 (-12)");
		});

		it("formats a 2v2 end frame with middle-dot separated teammates and their own deltas", () => {
			const frame = formatEnd([
				[
					{ name: "Diango", rating: 1012, delta: 12 },
					{ name: "Ally", rating: 1108, delta: 8 },
				],
				[
					{ name: "Rival", rating: 968, delta: -12 },
					{ name: "Foe", rating: 1192, delta: -8 },
				],
			]);

			expect(frame).toBe(
				"[Rating v1 end] Diango 1012 (+12) · Ally 1108 (+8) | Rival 968 (-12) · Foe 1192 (-8)",
			);
		});

		it("signs a zero delta as positive", () => {
			const frame = formatEnd([
				[{ name: "Diango", rating: 1000, delta: 0 }],
				[{ name: "Rival", rating: 1000, delta: 0 }],
			]);

			expect(frame).toBe("[Rating v1 end] Diango 1000 (+0) | Rival 1000 (+0)");
		});
	});
});
