import { Team } from "@shared/room/Team";

import { evaluateRatingEligibility } from "./RatingEligibility";

function makePlayers(overrides?: { winnerId?: string | null; loserId?: string | null }) {
	return [
		{
			id: "winnerId" in (overrides ?? {}) ? (overrides?.winnerId as string | null) : "player-1",
			team: Team.PLAYER,
			name: "Diango",
			winner: true,
		},
		{
			id: "loserId" in (overrides ?? {}) ? (overrides?.loserId as string | null) : "player-2",
			team: Team.OPPONENT,
			name: "Rival",
			winner: false,
		},
	];
}

describe("evaluateRatingEligibility", () => {
	describe("G1 — eligible ranked match", () => {
		it("returns eligible with the banlist and players carried through", () => {
			const result = evaluateRatingEligibility({
				ranked: true,
				banListName: "TCG",
				players: makePlayers(),
			});

			expect(result).toEqual({
				eligible: true,
				banListName: "TCG",
				players: [
					{ id: "player-1", team: Team.PLAYER, name: "Diango", winner: true },
					{ id: "player-2", team: Team.OPPONENT, name: "Rival", winner: false },
				],
			});
		});
	});

	describe("G2 — unranked match excluded", () => {
		it("returns ineligible with reason unranked", () => {
			const result = evaluateRatingEligibility({
				ranked: false,
				banListName: "TCG",
				players: makePlayers(),
			});

			expect(result).toEqual({ eligible: false, reason: "unranked" });
		});
	});

	describe("G3 — N/A banlist excluded", () => {
		it("returns ineligible with reason no-ranked-banlist", () => {
			const result = evaluateRatingEligibility({
				ranked: true,
				banListName: "N/A",
				players: makePlayers(),
			});

			expect(result).toEqual({ eligible: false, reason: "no-ranked-banlist" });
		});
	});

	describe("G4 — missing account id excluded", () => {
		it("returns ineligible with reason missing-account-id and the exact count", () => {
			const result = evaluateRatingEligibility({
				ranked: true,
				banListName: "TCG",
				players: makePlayers({ loserId: null }),
			});

			expect(result).toEqual({ eligible: false, reason: "missing-account-id", missingIdCount: 1 });
		});

		it("counts every participant missing an id, not just the first", () => {
			const result = evaluateRatingEligibility({
				ranked: true,
				banListName: "TCG",
				players: makePlayers({ winnerId: null, loserId: null }),
			});

			expect(result).toEqual({ eligible: false, reason: "missing-account-id", missingIdCount: 2 });
		});
	});

	describe("G6 — gate consistency", () => {
		it("is a pure function: evaluating the same eligible match twice yields equal results", () => {
			const match = { ranked: true, banListName: "TCG", players: makePlayers() };

			expect(evaluateRatingEligibility(match)).toEqual(evaluateRatingEligibility(match));
		});

		it("is a pure function: evaluating the same ineligible match twice yields equal results", () => {
			const match = { ranked: true, banListName: "N/A", players: makePlayers() };

			expect(evaluateRatingEligibility(match)).toEqual(evaluateRatingEligibility(match));
		});
	});
});
