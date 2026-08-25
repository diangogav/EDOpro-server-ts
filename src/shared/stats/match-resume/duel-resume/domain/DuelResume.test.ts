import { DuelResume } from "./DuelResume";

describe("DuelResume", () => {
	it("exposes exactly the data it was created with", () => {
		const data = {
			id: "duel-resume-1",
			userId: "user-1",
			gameId: "match-uuid-1",
			playerNames: ["Jaden"],
			opponentNames: ["Chazz"],
			date: new Date("2026-08-25"),
			banListName: "Global",
			banListHash: "123",
			result: "winner",
			turns: 9,
			matchId: "match-row-1",
			duelId: "duel-uuid-1",
			season: 3,
			ipAddress: null,
		};

		expect(DuelResume.create(data).data).toEqual(data);
	});
});
