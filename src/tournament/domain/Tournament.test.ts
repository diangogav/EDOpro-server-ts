import { TournamentMother } from "@test-support/mothers/tournament/TournamentMother";

import { TournamentError } from "./Tournament";

const OWNER = "organizer-account";
const NOW = "2026-10-18T13:00:00.000Z";

describe("Tournament", () => {
	it.each([
		2, 3, 4, 5, 7, 8, 9, 16, 31, 32, 63, 64,
	])("completes a %i-player bracket with deterministic byes and no character requirement", (count) => {
		const tournament = TournamentMother.create({ organizerId: OWNER });
		for (let index = 1; index <= count; index++)
			tournament.join({
				id: `entrant-${index}`,
				userId: `account-${index}`,
				displayName: `Player ${index}`,
				characterId: null,
			});
		expect(tournament.start(OWNER)).toBe(true);
		let reported = 0;
		while (tournament.toPrimitives().status !== "completed") {
			const ready = tournament.toPrimitives().matches.find((match) => match.status === "ready");
			expect(ready).toBeDefined();
			tournament.report(OWNER, ready!.id, 2, 0, NOW);
			reported++;
			expect(reported).toBeLessThanOrEqual(count - 1);
		}
		const state = tournament.toPrimitives();
		expect(reported).toBe(count - 1);
		expect(state.winnerId).toBe("entrant-1");
		expect(state.entrants.every((entrant) => entrant.characterId === null)).toBe(true);
		expect(
			state.matches
				.filter((match) => match.result)
				.every((match) => match.result?.source === "organizer"),
		).toBe(true);
	});

	it.each([
		1, 3, 5,
	] as const)("enforces best-of-%i scores and immutable committed results", (bestOf) => {
		const tournament = TournamentMother.create({ organizerId: OWNER, bestOf });
		for (let index = 0; index < 2; index++)
			tournament.join({
				id: String(index),
				userId: `account-${index}`,
				displayName: "Player",
				characterId: index ? 12 : null,
			});
		tournament.start(OWNER);
		const target = (bestOf + 1) / 2;
		for (const scores of [
			[0, 0],
			[target, target],
			[-1, target],
			[target + 1, 0],
			[target, 0.5],
		]) {
			expect(() => tournament.report(OWNER, "r1m1", scores[0], scores[1], NOW)).toThrow(
				TournamentError,
			);
		}
		expect(() => tournament.report("intruder", "r1m1", target, 0, NOW)).toThrow(
			"Only the organizer",
		);
		expect(tournament.report(OWNER, "r1m1", target, 0, NOW)).toBe(true);
		expect(tournament.report(OWNER, "r1m1", target, 0, NOW)).toBe(false);
		expect(() => tournament.report(OWNER, "r1m1", 0, target, NOW)).toThrow("not awaiting");
		expect(() => tournament.cancel(OWNER, null)).toThrow("Completed tournaments");
	});

	it("freezes the started roster and excludes account impersonation from organizer actions", () => {
		const tournament = TournamentMother.create({ organizerId: OWNER, capacity: 2 });
		const first = { id: "first", userId: "alice", displayName: "Alice", characterId: null };
		tournament.join(first);
		expect(tournament.join({ ...first, id: "duplicate", characterId: 99 })).toBe(false);
		expect(() => tournament.start(OWNER)).toThrow("At least two");
		tournament.join({ ...first, id: "second", userId: "bob" });
		expect(() => tournament.join({ ...first, id: "third", userId: "carol" })).toThrow("full");
		expect(() => tournament.start("alice")).toThrow("Only the organizer");
		tournament.start(OWNER);
		expect(() => tournament.join({ ...first, id: "third", userId: "carol" })).toThrow(
			"Registration has closed",
		);
		expect(() => tournament.cancel("alice", null)).toThrow("Only the organizer");
		expect(tournament.cancel(OWNER, "Organizer cancelled")).toBe(true);
		expect(tournament.cancel(OWNER, "Repeated request")).toBe(false);
		expect(() => tournament.report(OWNER, "r1m1", 2, 0, NOW)).toThrow("not awaiting");
	});

	it("does not expose mutable aggregate storage", () => {
		const tournament = TournamentMother.create();
		const copy = tournament.toPrimitives();
		copy.name = "changed";
		expect(tournament.toPrimitives().name).not.toBe("changed");
	});
});
