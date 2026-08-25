import { MatchResume } from "./MatchResume";

describe("MatchResume", () => {
	it("exposes exactly the data it was created with", () => {
		const data = {
			id: "match-resume-1",
			userId: "user-1",
			gameId: "match-uuid-1",
			bestOf: 3,
			playerNames: ["Jaden"],
			opponentNames: ["Chazz"],
			playerIds: ["u1"],
			opponentIds: ["u2"],
			date: new Date("2026-08-25"),
			banListName: "Global",
			banListHash: "123",
			playerScore: 2,
			opponentScore: 1,
			winner: true,
			season: 3,
			points: 7,
		};

		expect(MatchResume.create(data).data).toEqual(data);
	});
});
